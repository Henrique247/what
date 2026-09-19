import { Firestore, doc, getDoc } from 'firebase/firestore';
import { classifyJid, isPhoneMatch } from '../security';
import { GroupConfig } from '../types';

export interface GroupChatContext {
    type: 'GROUP';
    groupId: string;
    groupName: string;
    botIsAdmin: boolean;
    memberCount: number;
    admins: string[];
    moderation: {
        antiLink: boolean;
        antiSpam: boolean;
        antiBadWords: boolean;
        adminImmunity: boolean;
        maxWarnings: number;
    };
    currentUser: {
        jid: string;
        phone?: string;
        isAdmin: boolean;
        isOwner: boolean;
    };
}

export interface PrivateChatContext {
    type: 'PRIVATE';
    jid: string;
    phone?: string;
    isOwner: boolean;
    ownerName?: string;
    currentUser: {
        jid: string;
        phone?: string;
        isOwner: boolean;
    };
}

export type ChatContext = GroupChatContext | PrivateChatContext;

/**
 * Builds the strict, isolated chat context based purely on the JID classification.
 * Prevents any group data leakage into private chats, and prevents cross-group leakage.
 */
export async function buildChatContext(opts: {
    botId: string;
    targetChatJid: string;
    senderJid: string;
    senderPn?: string;
    senderLid?: string;
    isOwner: boolean;
    currentBot: any;
    sock: any;
    firestoreDb: Firestore;
}): Promise<ChatContext> {
    const { botId, targetChatJid, senderJid, senderPn, senderLid, isOwner, currentBot, sock, firestoreDb } = opts;
    const jidType = classifyJid(targetChatJid);

    // 1. GROUP CHAT CONTEXT
    if (jidType === 'GROUP' || targetChatJid.endsWith('@g.us')) {
        let groupName = 'Grupo';
        let memberCount = 0;
        let admins: string[] = [];
        let botIsAdmin = false;
        let userIsAdmin = false;

        // Try getting real Baileys group metadata
        if (sock?.groupMetadata) {
            try {
                const metadata = await sock.groupMetadata(targetChatJid);
                groupName = metadata.subject || groupName;
                memberCount = metadata.participants?.length || 0;

                const myJid = sock.user?.id ? sock.user.id.split(':')[0] : '';
                const myLid = sock.user?.lid ? sock.user.lid.split(':')[0] : '';
                const senderClean = senderJid.split(':')[0];

                for (const p of (metadata.participants || [])) {
                    const pId = (p.id || '').split(':')[0];
                    const pLid = (p.lid || '').split(':')[0];

                    if (p.admin === 'admin' || p.admin === 'superadmin') {
                        admins.push(pId);
                        if ((myJid && pId === myJid) || (myLid && pLid === myLid)) {
                            botIsAdmin = true;
                        }
                        if (pId === senderClean || (senderPn && pId === senderPn.split('@')[0])) {
                            userIsAdmin = true;
                        }
                    }
                }
            } catch (err) {
                console.warn(`[ChatContext] Falha ao obter metadados do grupo ${targetChatJid}:`, err);
            }
        }

        // Fetch group-specific moderation config from Firestore
        let moderation = {
            antiLink: false,
            antiSpam: false,
            antiBadWords: false,
            adminImmunity: true,
            maxWarnings: 3
        };

        try {
            const groupSnap = await getDoc(doc(firestoreDb, 'bots', botId, 'groups', targetChatJid));
            if (groupSnap.exists()) {
                const data = groupSnap.data() as GroupConfig;
                groupName = data.groupName || groupName;
                moderation = {
                    antiLink: !!data.antiLinkEnabled,
                    antiSpam: !!data.antiSpamEnabled,
                    antiBadWords: !!data.antiBadWordsEnabled,
                    adminImmunity: data.adminImmunity !== false,
                    maxWarnings: data.maxWarnings || 3
                };
            }
        } catch {}

        return {
            type: 'GROUP',
            groupId: targetChatJid,
            groupName,
            botIsAdmin,
            memberCount,
            admins,
            moderation,
            currentUser: {
                jid: senderJid,
                phone: senderPn || undefined,
                isAdmin: userIsAdmin,
                isOwner
            }
        };
    }

    // 2. PRIVATE CHAT CONTEXT
    return {
        type: 'PRIVATE',
        jid: targetChatJid,
        phone: senderPn || undefined,
        isOwner,
        ownerName: currentBot.ownerName || undefined,
        currentUser: {
            jid: senderJid,
            phone: senderPn || undefined,
            isOwner
        }
    };
}

/**
 * Helper to get the current date and time formatted specifically for Africa/Luanda (UTC+1).
 */
export function getLuandaTemporalInfo(): { fullText: string; timeStr: string; dateStr: string; timezone: string } {
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('pt-PT', {
        timeZone: 'Africa/Luanda',
        dateStyle: 'full'
    }).format(now);

    const timeStr = new Intl.DateTimeFormat('pt-PT', {
        timeZone: 'Africa/Luanda',
        timeStyle: 'medium'
    }).format(now);

    return {
        fullText: `${dateStr}, às ${timeStr} (Horário de Angola - Africa/Luanda, UTC+1)`,
        timeStr,
        dateStr,
        timezone: 'Africa/Luanda (UTC+1)'
    };
}

/**
 * Formats the strict system prompt injection matching user guidelines:
 * - In GROUP: ONLY injects that group's details. No other groups.
 * - In PRIVATE: ONLY injects private conversational context. No group details.
 * - Temporal context: Always accurate to Africa/Luanda (UTC+1).
 */
export function formatSystemPromptContext(context: ChatContext, currentBot: any): string {
    const temporal = getLuandaTemporalInfo();
    const temporalSnippet = `\nContexto Temporal Atual: ${temporal.fullText}`;

    if (context.type === 'GROUP') {
        const adminNames = context.admins.slice(0, 10).join(', ');
        return `\n\n=== CONTEXTO DO GRUPO ATUAL (ISOLADO) ===
${temporalSnippet}
Grupo ID: ${context.groupId}
Nome do Grupo: ${context.groupName}
Total de Membros: ${context.memberCount}
O Bot é Administrador: ${context.botIsAdmin ? 'SIM' : 'NÃO'}
Administradores: ${adminNames || 'Nenhum listado'}
Moderação Ativa: Links=${context.moderation.antiLink}, Spam=${context.moderation.antiSpam}, Palavras=${context.moderation.antiBadWords}
Interlocutor: JID=${context.currentUser.jid}, Administrador=${context.currentUser.isAdmin ? 'SIM' : 'NÃO'}, Proprietário=${context.currentUser.isOwner ? 'SIM' : 'NÃO'}
Regra: Você está respondendo dentro deste grupo. NUNCA cite informações privadas ou de outros grupos.`;
    }

    // PRIVATE CONTEXT
    let ownerSnippet = '';
    if (context.isOwner) {
        ownerSnippet = `\nVocê está conversando com o PROPRIETÁRIO do bot (${context.ownerName || 'Proprietário'}). Trate-o com total respeito e prontidão.`;
    }

    return `\n\n=== CONTEXTO DA CONVERSA PRIVADA (ISOLADO) ===
${temporalSnippet}
Tipo: Conversa Direta Privada
Interlocutor: ${context.currentUser.phone ? `+${context.currentUser.phone}` : context.currentUser.jid}
Proprietário: ${context.isOwner ? 'SIM' : 'NÃO'}${ownerSnippet}
Regra: Não mencione dados de grupos nesta conversa a menos que o usuário pergunte explicitamente sobre eles.`;
}
