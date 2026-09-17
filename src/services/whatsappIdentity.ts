import { 
    jidNormalizedUser, 
    areJidsSameUser, 
    isLidUser, 
    isPnUser, 
    jidDecode 
} from '@whiskeysockets/baileys';
import { Firestore, doc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { normalizePhone, isPhoneMatch, classifyJid, normalizeLid } from '../security';
import { recordAuditLog } from '../audit';

export interface OwnWhatsAppIdentity {
    botId: string;
    ownJid: string;         // e.g. "244923000111@s.whatsapp.net"
    ownPhone: string;       // e.g. "244923000111"
    ownPn: string;          // e.g. "244923000111"
    ownLid?: string;        // e.g. "29596971991096@lid"
    ownLidUser?: string;    // e.g. "29596971991096"
    name?: string;
}

// In-memory cache for resolved bot identities
const botIdentityCache = new Map<string, OwnWhatsAppIdentity>();

/**
 * Resolves the bot's real identity across @s.whatsapp.net, @lid, phone number and PN.
 * Integrates directly with Baileys authState, sock.user, and signalRepository LID mapping.
 */
export async function resolveOwnWhatsAppIdentity(
    sock: any,
    botDoc?: any,
    botId?: string,
    firestoreDb?: Firestore
): Promise<OwnWhatsAppIdentity> {
    const idKey = botId || botDoc?.id || 'default_bot';
    let cached = botIdentityCache.get(idKey);

    const userObj = sock?.user || sock?.authState?.creds?.me;
    const rawId: string = userObj?.id || botDoc?.botJid || botDoc?.botPhone || '';
    const rawLid: string = userObj?.lid || botDoc?.botLid || '';
    const rawName: string = userObj?.name || botDoc?.name || '';

    // Normalized user JID without device (e.g. 244923000111@s.whatsapp.net)
    const normalizedJid = rawId ? jidNormalizedUser(rawId) : (cached?.ownJid || '');
    const phone = normalizedJid ? normalizePhone(normalizedJid) : (botDoc?.botPhone ? normalizePhone(botDoc.botPhone) : (cached?.ownPhone || ''));
    
    // Normalized LID without device (e.g. 29596971991096@lid)
    let normalizedLid = rawLid ? jidNormalizedUser(rawLid) : (cached?.ownLid || '');
    let lidUser = normalizedLid ? normalizedLid.split('@')[0] : (cached?.ownLidUser || '');

    // Try Baileys Signal Repository LID mapping if LID is not known yet
    if (!normalizedLid && phone && sock?.signalRepository?.lidMapping?.getLIDForPN) {
        try {
            const queriedLid = await sock.signalRepository.lidMapping.getLIDForPN(`${phone}@s.whatsapp.net`);
            if (queriedLid) {
                normalizedLid = jidNormalizedUser(queriedLid);
                lidUser = normalizedLid.split('@')[0];
            }
        } catch (e) {
            // Ignore LID mapping resolution errors
        }
    }

    const identity: OwnWhatsAppIdentity = {
        botId: idKey,
        ownJid: normalizedJid || (phone ? `${phone}@s.whatsapp.net` : ''),
        ownPhone: phone,
        ownPn: phone,
        ownLid: normalizedLid || undefined,
        ownLidUser: lidUser || undefined,
        name: rawName || cached?.name || undefined
    };

    botIdentityCache.set(idKey, identity);

    // Save discovered phone and LID back to Firestore bot document for permanent persistence
    if (firestoreDb && idKey && idKey !== 'default_bot' && (identity.ownPhone || identity.ownLid)) {
        try {
            const updatePayload: Record<string, any> = {};
            if (identity.ownPhone) updatePayload.botPhone = identity.ownPhone;
            if (identity.ownJid) updatePayload.botJid = identity.ownJid;
            if (identity.ownLid) updatePayload.botLid = identity.ownLid;
            
            const botDocRef = doc(firestoreDb, 'bots', idKey);
            await setDoc(botDocRef, updatePayload, { merge: true });
        } catch (dbErr) {
            // Non-blocking firestore update
        }
    }

    return identity;
}

/**
 * Registers an acquired LID for the bot's identity when detected from a participant or group event.
 */
export function registerBotLid(botId: string, lid: string) {
    if (!lid) return;
    const normalized = jidNormalizedUser(lid);
    const cached = botIdentityCache.get(botId);
    if (cached) {
        cached.ownLid = normalized;
        cached.ownLidUser = normalized.split('@')[0];
        botIdentityCache.set(botId, cached);
    }
}

/**
 * Safely determines if any JID, LID, or phone identifier belongs to the bot itself.
 * Compares without manual insecure conversions, handling both PN and LID domains.
 */
export function isSelfIdentity(
    identifier: string | undefined | null,
    identity: OwnWhatsAppIdentity,
    sock?: any
): boolean {
    if (!identifier) return false;
    const raw = identifier.trim();
    const candidateType = classifyJid(raw);

    // 1. Direct JID comparison using Baileys areJidsSameUser
    if (identity.ownJid && areJidsSameUser(raw, identity.ownJid)) {
        return true;
    }

    // 2. Direct LID comparison
    if (candidateType === 'LID' || raw.endsWith('@lid')) {
        if (identity.ownLid && areJidsSameUser(raw, identity.ownLid)) {
            return true;
        }
        if (identity.ownLidUser && raw.split('@')[0] === identity.ownLidUser) {
            return true;
        }
        return false;
    }

    // 3. Phone digits comparison (for Phone/PN)
    if (candidateType === 'PRIVATE_PN' || !raw.includes('@')) {
        const norm = normalizePhone(raw);
        if (norm && identity.ownPhone && (norm === identity.ownPhone || isPhoneMatch(norm, identity.ownPhone))) {
            return true;
        }
    }

    // 4. Baileys decoded JID matching
    try {
        const decoded = jidDecode(raw);
        if (decoded?.user) {
            if (decoded.server === 's.whatsapp.net' && identity.ownPhone && decoded.user === identity.ownPhone) return true;
            if (decoded.server === 'lid' && identity.ownLidUser && decoded.user === identity.ownLidUser) return true;
        }
    } catch {}

    return false;
}

export interface BotParticipantResult {
    isBot: boolean;
    isBotAdmin: boolean;
    role: 'superadmin' | 'admin' | 'member';
    participant: any | null;
}

/**
 * Finds the bot in a group's participant list and determines admin status and role.
 * Inspects all possible fields provided by Baileys (id, lid, phoneNumber, pn, jid, admin, isAdmin).
 */
export function findBotParticipant(
    participants: any[] | undefined,
    identity: OwnWhatsAppIdentity,
    groupMeta?: any,
    sock?: any
): BotParticipantResult {
    const list = Array.isArray(participants) ? participants : [];

    // Check if bot is the group owner / creator from metadata
    let isOwner = false;
    if (groupMeta?.owner && isSelfIdentity(groupMeta.owner, identity, sock)) {
        isOwner = true;
    }
    if (groupMeta?.ownerPn && isSelfIdentity(groupMeta.ownerPn, identity, sock)) {
        isOwner = true;
    }

    for (const p of list) {
        let matched = false;

        if (p.id && isSelfIdentity(p.id, identity, sock)) matched = true;
        else if (p.jid && isSelfIdentity(p.jid, identity, sock)) matched = true;
        else if (p.lid && identity.ownLid && areJidsSameUser(p.lid, identity.ownLid)) matched = true;
        else if ((p.phoneNumber || p.pn) && isSelfIdentity(p.phoneNumber || p.pn, identity, sock)) matched = true;

        if (matched) {
            // If participant is LID format and our cached LID was missing, learn it!
            if (p.id && isLidUser(p.id) && !identity.ownLid) {
                registerBotLid(identity.botId, p.id);
            }

            const rawAdmin = p.admin;
            const isAdmin = rawAdmin === 'admin' || rawAdmin === 'superadmin' || p.isAdmin === true || p.isSuperAdmin === true || isOwner;
            const role: 'superadmin' | 'admin' | 'member' = (rawAdmin === 'superadmin' || p.isSuperAdmin === true || isOwner)
                ? 'superadmin'
                : (isAdmin ? 'admin' : 'member');

            return {
                isBot: true,
                isBotAdmin: isAdmin,
                role,
                participant: p
            };
        }
    }

    if (isOwner) {
        return {
            isBot: true,
            isBotAdmin: true,
            role: 'superadmin',
            participant: null
        };
    }

    return {
        isBot: false,
        isBotAdmin: false,
        role: 'member',
        participant: null
    };
}

/**
 * Checks whether a message mentions the bot or is a reply (quote) to a message sent by the bot.
 */
export function checkIsMentionedOrReply(opts: {
    messageObj: any;
    rawText?: string;
    identity: OwnWhatsAppIdentity;
    sock?: any;
}): { isMentioned: boolean; isReplyToBot: boolean } {
    const { messageObj, rawText, identity, sock } = opts;
    if (!messageObj) return { isMentioned: false, isReplyToBot: false };

    // Extract contextInfo from all supported message types
    const contextInfo = messageObj.extendedTextMessage?.contextInfo
        || messageObj.imageMessage?.contextInfo
        || messageObj.documentMessage?.contextInfo
        || messageObj.videoMessage?.contextInfo
        || messageObj.audioMessage?.contextInfo
        || messageObj.stickerMessage?.contextInfo
        || messageObj.buttonsResponseMessage?.contextInfo
        || messageObj.templateButtonReplyMessage?.contextInfo
        || messageObj.listResponseMessage?.contextInfo
        || messageObj.interactiveResponseMessage?.contextInfo;

    // 1. Mentions check
    let isMentioned = false;
    const mentionedJids: string[] = contextInfo?.mentionedJid || [];
    
    for (const mJid of mentionedJids) {
        if (isSelfIdentity(mJid, identity, sock)) {
            isMentioned = true;
            break;
        }
    }

    // Check textual mention fallback (@2449xxxxxx)
    if (!isMentioned && rawText && identity.ownPhone) {
        if (rawText.includes(`@${identity.ownPhone}`) || rawText.includes(identity.ownPhone)) {
            isMentioned = true;
        }
    }

    // 2. Reply (quoted message) check
    let isReplyToBot = false;
    const quotedParticipant = contextInfo?.participant;
    if (quotedParticipant && isSelfIdentity(quotedParticipant, identity, sock)) {
        isReplyToBot = true;
    }

    return { isMentioned, isReplyToBot };
}

/**
 * Synchronizes all participating WhatsApp groups for a bot, correctly calculating admin status,
 * updating Firestore cache, emitting structured [ADMIN_GROUPS_FETCH] logs, and returning all groups.
 */
export async function syncBotGroups(
    botId: string,
    sock: any,
    firestoreDb: Firestore,
    currentBot?: any
): Promise<any[]> {
    const identity = await resolveOwnWhatsAppIdentity(sock, currentBot, botId, firestoreDb);
    const groupsList: any[] = [];

    if (!sock) {
        console.warn(`[Bot ${botId}] Impossível sincronizar grupos: Socket não disponível`);
        return groupsList;
    }

    try {
        const participating = await sock.groupFetchAllParticipating();
        const entries = Object.entries(participating as Record<string, any>);

        for (const [gId, gMeta] of entries) {
            const participants = gMeta.participants || [];
            const botResult = findBotParticipant(participants, identity, gMeta, sock);

            const groupEntry = {
                groupId: gId,
                groupName: gMeta.subject || 'Grupo WhatsApp',
                groupDesc: gMeta.desc?.toString() || '',
                participantCount: participants.length,
                botIsAdmin: botResult.isBotAdmin,
                botRole: botResult.role,
                owner: gMeta.owner || gMeta.creator || '',
                creation: gMeta.creation || 0,
                canDeleteMessages: botResult.isBotAdmin,
                canKickParticipants: botResult.isBotAdmin,
                canEditGroupInfo: botResult.isBotAdmin,
                lastSyncedAt: new Date().toISOString()
            };

            // Persist to Firestore
            try {
                const groupRef = doc(firestoreDb, 'bots', botId, 'groups', gId);
                await setDoc(groupRef, {
                    botId,
                    groupId: gId,
                    groupName: groupEntry.groupName,
                    groupDesc: groupEntry.groupDesc,
                    participantCount: groupEntry.participantCount,
                    botIsAdmin: groupEntry.botIsAdmin,
                    botRole: groupEntry.botRole,
                    owner: groupEntry.owner,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } catch (saveErr) {
                // Non-blocking Firestore save error
            }

            groupsList.push(groupEntry);
        }

        const adminGroupsCount = groupsList.filter(g => g.botIsAdmin).length;

        // Structured log as required in Section 15
        console.log(`[ADMIN_GROUPS_FETCH]`, {
            botId,
            totalGroupsFound: groupsList.length,
            adminGroupsFound: adminGroupsCount,
            groups: groupsList.map(g => ({
                id: g.groupId,
                subject: g.groupName,
                botIsAdmin: g.botIsAdmin,
                role: g.botRole
            }))
        });

        await recordAuditLog(firestoreDb, {
            botId,
            action: 'ADMIN_GROUPS_FETCH',
            result: 'SUCCESS',
            details: `Sincronizados ${groupsList.length} grupos (${adminGroupsCount} como administrador)`
        });

    } catch (fetchErr: any) {
        console.error(`[Bot ${botId}] Erro ao buscar grupos via Baileys:`, fetchErr);
        await recordAuditLog(firestoreDb, {
            botId,
            action: 'ADMIN_GROUPS_FETCH',
            result: 'ERROR',
            details: `Falha ao consultar grupos no Baileys: ${fetchErr.message || String(fetchErr)}`
        });
    }

    return groupsList;
}
