import { Firestore } from 'firebase/firestore';
import { recordAuditLog } from '../audit';

export type ChatType = 'PRIVATE' | 'GROUP' | 'NEWSLETTER' | 'LID' | 'BROADCAST' | 'UNKNOWN';

export interface ResolvedMessageDestination {
    chatType: ChatType;
    destinationJid: string | null;
    senderJid: string;
    remoteJid: string;
    participantJid?: string;
    canReply: boolean;
    reason?: string;
    senderPn?: string;
    senderLid?: string;
}

/**
 * Determines chat type directly from JID domain suffix.
 */
export function getChatTypeFromJid(jid?: string | null): ChatType {
    if (!jid || typeof jid !== 'string') return 'UNKNOWN';
    if (jid === 'status@broadcast' || jid.endsWith('@broadcast')) return 'BROADCAST';
    if (jid.endsWith('@newsletter')) return 'NEWSLETTER';
    if (jid.endsWith('@g.us')) return 'GROUP';
    if (jid.endsWith('@s.whatsapp.net')) return 'PRIVATE';
    if (jid.endsWith('@lid')) return 'LID';
    return 'UNKNOWN';
}

/**
 * Validates if a destination JID is permitted for outgoing bot messages.
 * Newsletters, broadcast status, and empty JIDs are strictly disallowed.
 */
export function isAllowedDestination(jid?: string | null): boolean {
    if (!jid || typeof jid !== 'string') return false;
    const clean = jid.trim();
    if (clean.endsWith('@newsletter')) return false;
    if (clean === 'status@broadcast' || clean.endsWith('@broadcast')) return false;
    return clean.endsWith('@s.whatsapp.net') || clean.endsWith('@g.us') || clean.endsWith('@lid');
}

/**
 * Resolves the destination JID and chat type for any incoming WhatsApp message.
 * 
 * CRITICAL RULES:
 * 1. For GROUP messages (@g.us), destinationJid is ALWAYS the group remoteJid, NEVER participant.
 * 2. For NEWSLETTER messages (@newsletter), canReply is ALWAYS false; bot never replies.
 * 3. For BROADCAST messages (@broadcast), canReply is ALWAYS false.
 * 4. For LID messages (@lid), validates LID and uses Baileys repository if available, NEVER arbitrary replace.
 */
export async function resolveMessageDestination(
    msg: any,
    botId: string,
    sock?: any
): Promise<ResolvedMessageDestination> {
    const rawRemoteJid: string = msg?.key?.remoteJid || '';
    const rawParticipant: string | undefined = msg?.key?.participant || (msg as any)?.participant || undefined;
    const senderPn: string | undefined = (msg as any)?.key?.senderPn || (msg as any)?.senderPn || undefined;
    const senderLid: string | undefined = (msg as any)?.key?.senderLid || (msg as any)?.senderLid || undefined;

    if (!rawRemoteJid || typeof rawRemoteJid !== 'string') {
        return {
            chatType: 'UNKNOWN',
            destinationJid: null,
            senderJid: rawParticipant || '',
            remoteJid: '',
            participantJid: rawParticipant,
            canReply: false,
            reason: 'Mensagem sem remoteJid válido'
        };
    }

    const remoteJid = rawRemoteJid.trim();
    const chatType = getChatTypeFromJid(remoteJid);

    // 1. BROADCAST / STATUS
    if (chatType === 'BROADCAST') {
        return {
            chatType: 'BROADCAST',
            destinationJid: null,
            senderJid: rawParticipant || remoteJid,
            remoteJid,
            participantJid: rawParticipant,
            canReply: false,
            reason: 'Status e broadcast não aceitam respostas automáticas'
        };
    }

    // 2. NEWSLETTER / CHANNELS (Read-only broadcast channels)
    if (chatType === 'NEWSLETTER') {
        return {
            chatType: 'NEWSLETTER',
            destinationJid: null,
            senderJid: remoteJid,
            remoteJid,
            participantJid: undefined,
            canReply: false,
            reason: 'Canais/newsletters são somente leitura e não aceitam respostas'
        };
    }

    // 3. GROUP CHATS (@g.us)
    if (chatType === 'GROUP') {
        // In groups, the response destination is ALWAYS the group remoteJid, NEVER participant!
        return {
            chatType: 'GROUP',
            destinationJid: remoteJid,
            senderJid: rawParticipant || remoteJid,
            remoteJid,
            participantJid: rawParticipant,
            canReply: true,
            senderPn,
            senderLid: rawParticipant?.endsWith('@lid') ? rawParticipant : senderLid
        };
    }

    // 4. PRIVATE USER CHATS (@s.whatsapp.net)
    if (chatType === 'PRIVATE') {
        return {
            chatType: 'PRIVATE',
            destinationJid: remoteJid,
            senderJid: remoteJid,
            remoteJid,
            participantJid: undefined,
            canReply: true,
            senderPn: remoteJid,
            senderLid
        };
    }

    // 5. DIRECT 1-ON-1 LID CHATS (@lid)
    if (chatType === 'LID') {
        let mappedPn: string | undefined = senderPn;

        // Try resolving phone number through Baileys v7 LIDMappingStore if available
        if (!mappedPn && sock?.signalRepository?.lidMapping?.getPNForLID) {
            try {
                const res = await sock.signalRepository.lidMapping.getPNForLID(remoteJid);
                if (res && typeof res === 'string') {
                    mappedPn = res;
                }
            } catch (lidErr) {
                // Ignore silent lookup error
            }
        }

        // Validate LID structure (digits only before @lid)
        const isLidValid = /^\d+@lid$/.test(remoteJid);

        if (!isLidValid) {
            return {
                chatType: 'LID',
                destinationJid: null,
                senderJid: remoteJid,
                remoteJid,
                canReply: false,
                reason: `JID de LID com formato inválido: ${remoteJid}`,
                senderPn: mappedPn,
                senderLid: remoteJid
            };
        }

        return {
            chatType: 'LID',
            destinationJid: remoteJid,
            senderJid: remoteJid,
            remoteJid,
            participantJid: undefined,
            canReply: true,
            senderPn: mappedPn,
            senderLid: remoteJid
        };
    }

    // 6. UNKNOWN FORMAT
    return {
        chatType: 'UNKNOWN',
        destinationJid: null,
        senderJid: remoteJid,
        remoteJid,
        participantJid: rawParticipant,
        canReply: false,
        reason: `JID com formato não suportado para envio: ${remoteJid}`
    };
}

/**
 * Extracts and unwraps media objects from WhatsApp message wrappers.
 */
export function extractMediaMessage(messageObj: any): { mediaObj: any; mediaType: string } | null {
    if (!messageObj) return null;
    let unwrapped = messageObj;

    if (unwrapped.ephemeralMessage?.message) {
        unwrapped = unwrapped.ephemeralMessage.message;
    }
    if (unwrapped.viewOnceMessage?.message) {
        unwrapped = unwrapped.viewOnceMessage.message;
    }
    if (unwrapped.viewOnceMessageV2?.message) {
        unwrapped = unwrapped.viewOnceMessageV2.message;
    }
    if (unwrapped.documentWithCaptionMessage?.message) {
        unwrapped = unwrapped.documentWithCaptionMessage.message;
    }

    if (unwrapped.imageMessage) return { mediaObj: unwrapped.imageMessage, mediaType: 'image' };
    if (unwrapped.documentMessage) return { mediaObj: unwrapped.documentMessage, mediaType: 'document' };
    if (unwrapped.videoMessage) return { mediaObj: unwrapped.videoMessage, mediaType: 'video' };
    if (unwrapped.audioMessage) return { mediaObj: unwrapped.audioMessage, mediaType: 'audio' };
    if (unwrapped.stickerMessage) return { mediaObj: unwrapped.stickerMessage, mediaType: 'sticker' };

    return null;
}

/**
 * Checks if a media message contains a valid, non-empty mediaKey before decryption.
 */
export function hasValidMediaKey(mediaObj: any): boolean {
    if (!mediaObj) return false;
    const key = mediaObj.mediaKey;
    if (!key) return false;
    if (typeof key === 'string' && key.trim().length > 0) return true;
    if (Buffer.isBuffer(key) && key.length > 0) return true;
    if (key instanceof Uint8Array && key.length > 0) return true;
    if (typeof key === 'object' && Array.isArray(key.data) && key.data.length > 0) return true;
    return false;
}

export interface SendBotMessageOptions {
    botId: string;
    destinationJid: string;
    content: any;
    options?: any;
    context?: {
        actionName?: string;
        messageId?: string;
        chatType?: string;
        actorId?: string;
    };
}

/**
 * Centralized, secure message sending pipeline.
 * Performs validation, audit logging, multi-bot isolation, and prevents invalid destination errors.
 */
export async function sendBotMessage(
    opts: SendBotMessageOptions,
    firestoreDb: Firestore,
    getActiveSock: (botId: string) => any,
    getConnectionStatus: (botId: string) => string | undefined
): Promise<boolean> {
    const { botId, destinationJid, content, options, context } = opts;
    const startTime = Date.now();
    const chatType = context?.chatType || getChatTypeFromJid(destinationJid);

    // Safely summarize payload type without leaking sensitive content
    const payloadSummary = content?.text ? 'text'
        : content?.image ? 'image'
        : content?.document ? 'document'
        : content?.audio ? 'audio'
        : content?.video ? 'video'
        : content?.delete ? 'delete'
        : Object.keys(content || {})[0] || 'unknown';

    // 1. Bot existence and connection verification
    const sock = getActiveSock(botId);
    const status = getConnectionStatus(botId);

    if (!sock || status !== 'Conectado') {
        console.warn(`[Bot ${botId}] Envio bloqueado: Bot desconectado (${status || 'OFFLINE'}). Destino: ${destinationJid}`);
        await recordAuditLog(firestoreDb, {
            botId,
            action: 'MESSAGE_SEND_FAILED',
            result: 'ERROR',
            chatId: destinationJid,
            destinationJid,
            chatType,
            details: `Bot não está conectado. Status atual: ${status || 'OFFLINE'}`
        });
        return false;
    }

    // 2. Validate destination JID
    if (!isAllowedDestination(destinationJid)) {
        console.warn(`[Bot ${botId}] Destino inválido ou bloqueado para envio: ${destinationJid}`);
        await recordAuditLog(firestoreDb, {
            botId,
            action: 'MESSAGE_SEND_FAILED',
            result: 'ERROR',
            chatId: destinationJid,
            destinationJid,
            chatType,
            details: `Destino inválido para envio: ${destinationJid}`
        });
        return false;
    }

    // 3. Register MESSAGE_SEND_ATTEMPT
    await recordAuditLog(firestoreDb, {
        botId,
        action: 'MESSAGE_SEND_ATTEMPT',
        result: 'SUCCESS',
        chatId: destinationJid,
        destinationJid,
        chatType,
        payloadSummary,
        details: `Tentativa de envio de mensagem (${payloadSummary}) para ${destinationJid}`
    });

    // 4. Execute Baileys sendMessage
    try {
        const sendResult = await sock.sendMessage(destinationJid, content, options);
        const latencyMs = Date.now() - startTime;
        const sentMessageId = sendResult?.key?.id || context?.messageId || undefined;

        // 5. Register MESSAGE_SEND_SUCCESS
        await recordAuditLog(firestoreDb, {
            botId,
            action: 'MESSAGE_SEND_SUCCESS',
            result: 'SUCCESS',
            chatId: destinationJid,
            destinationJid,
            chatType,
            messageId: sentMessageId,
            latencyMs,
            payloadSummary,
            details: `Mensagem (${payloadSummary}) enviada com sucesso em ${latencyMs}ms`
        });

        return true;
    } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        console.error(`[Bot ${botId}] Erro ao enviar mensagem para ${destinationJid}:`, err);

        // 6. Register MESSAGE_SEND_FAILED with technical diagnosis
        await recordAuditLog(firestoreDb, {
            botId,
            action: 'MESSAGE_SEND_FAILED',
            result: 'ERROR',
            chatId: destinationJid,
            destinationJid,
            chatType,
            latencyMs,
            errorName: err.name || 'SendError',
            errorMessage: err.message || String(err),
            errorCode: err.code || 'SEND_ERROR',
            stack: err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : undefined,
            payloadSummary,
            details: err.message || 'Erro no envio Baileys'
        });

        return false;
    }
}
