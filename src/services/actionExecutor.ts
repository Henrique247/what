import { Firestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { recordAuditLog } from '../audit';
import { hasPermission } from '../security';

export interface ActionExecutorParams {
    botId: string;
    actorJid: string;
    actorRole: 'OWNER' | 'ADMIN' | 'USER';
    sock: any;
    firestoreDb: Firestore;
    currentBot: any;
}

export interface ActionResult {
    success: boolean;
    message: string;
    error?: string;
    data?: any;
    auditStatus: 'SUCCESS' | 'DENIED' | 'ERROR';
}

/**
 * Checks if the bot itself has administrator privileges in the specified group.
 */
export async function isBotGroupAdmin(sock: any, groupId: string): Promise<boolean> {
    if (!sock || !groupId) return false;
    try {
        const metadata = await sock.groupMetadata(groupId);
        const myJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
        const myLid = sock.user?.lid ? sock.user.lid.split(':')[0] + '@lid' : '';

        const myParticipant = metadata.participants?.find((p: any) => {
            const pId = (p.id || '').split(':')[0];
            const pLid = (p.lid || '').split(':')[0];
            return (myJid && pId === myJid.split('@')[0]) || (myLid && pLid === myLid.split('@')[0]);
        });

        return !!(myParticipant && (myParticipant.admin === 'admin' || myParticipant.admin === 'superadmin'));
    } catch (e) {
        console.warn(`[ActionExecutor] Falha ao consultar metadados do grupo ${groupId}:`, e);
        return false;
    }
}

/**
 * Centralized, authoritative ActionExecutor.
 * Purely backend-governed with strict permission validation, bot-admin checks, and auditing.
 */
export class ActionExecutor {
    /**
     * Sends a message to a WhatsApp group.
     */
    static async sendGroupMessage(params: ActionExecutorParams & {
        groupId: string;
        message: string;
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, currentBot, groupId, message } = params;
        const startTime = Date.now();

        if (!botId || !sock) {
            return {
                success: false,
                message: 'WhatsApp desconectado ou bot inválido.',
                auditStatus: 'ERROR'
            };
        }

        // 1. Permission check
        if (actorRole !== 'OWNER' && actorRole !== 'ADMIN' && !hasPermission(currentBot, 'GROUP_MESSAGE_SEND')) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                chatType: 'GROUP',
                result: 'DENIED',
                details: 'Permissão GROUP_MESSAGE_SEND não concedida ao remetente.'
            });
            return {
                success: false,
                message: 'Você não tem permissão para enviar mensagens em grupos.',
                auditStatus: 'DENIED'
            };
        }

        // 2. Validate group destination JID
        if (!groupId || !groupId.endsWith('@g.us')) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MESSAGE_SEND_FAILED',
                chatId: groupId,
                chatType: 'GROUP',
                result: 'ERROR',
                details: `JID inválido para grupo: ${groupId}`
            });
            return {
                success: false,
                message: `Destinatário inválido para grupo: ${groupId}. O identificador deve terminar em @g.us.`,
                auditStatus: 'ERROR'
            };
        }

        const trimmed = (message || '').trim();
        if (!trimmed) {
            return {
                success: false,
                message: 'A mensagem não pode estar vazia.',
                auditStatus: 'ERROR'
            };
        }

        try {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MESSAGE_SEND_ATTEMPT',
                chatId: groupId,
                chatType: 'GROUP',
                result: 'SUCCESS',
                details: `Tentativa de envio de mensagem para o grupo ${groupId}`
            });

            const sentMsg = await sock.sendMessage(groupId, { text: trimmed });
            const messageId = sentMsg?.key?.id;

            if (!messageId) {
                throw new Error('Baileys não retornou confirmação de entrega (messageId ausente).');
            }

            const duration = Date.now() - startTime;
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MESSAGE_SEND_SUCCESS',
                chatId: groupId,
                chatType: 'GROUP',
                result: 'SUCCESS',
                duration,
                messageId,
                details: `Mensagem enviada com sucesso para o grupo ${groupId} (ID: ${messageId}).`
            });

            return {
                success: true,
                message: 'Mensagem enviada para o grupo com sucesso.',
                data: { messageId },
                auditStatus: 'SUCCESS'
            };
        } catch (err: any) {
            console.error(`[ActionExecutor] Erro ao enviar mensagem para grupo ${groupId}:`, err);
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MESSAGE_SEND_FAILED',
                chatId: groupId,
                chatType: 'GROUP',
                result: 'ERROR',
                errorMessage: err.message,
                details: `Falha técnica ao despachar mensagem no Baileys para ${groupId}: ${err.message}`
            });
            return {
                success: false,
                message: `Não foi possível enviar a mensagem para o grupo: ${err.message || 'Erro no WhatsApp'}`,
                error: err.message,
                auditStatus: 'ERROR'
            };
        }
    }

    /**
     * Removes a participant from a WhatsApp group.
     * Enforces that the bot MUST be an administrator of the group.
     */
    static async removeGroupParticipant(params: ActionExecutorParams & {
        groupId: string;
        targetJid: string;
        targetPhone?: string;
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, currentBot, groupId, targetJid, targetPhone } = params;
        const startTime = Date.now();

        if (!sock) {
            return {
                success: false,
                message: 'Sessão do WhatsApp desconectada.',
                auditStatus: 'ERROR'
            };
        }

        // 1. Permission check
        if (actorRole !== 'OWNER' && actorRole !== 'ADMIN' && !hasPermission(currentBot, 'GROUP_MEMBER_REMOVE')) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                chatType: 'GROUP',
                target: targetJid,
                result: 'DENIED',
                details: 'Tentativa não autorizada de remover participante.'
            });
            return {
                success: false,
                message: 'Você não tem permissão para remover membros do grupo.',
                auditStatus: 'DENIED'
            };
        }

        // 2. Validate if bot is admin
        const botIsAdmin = await isBotGroupAdmin(sock, groupId);
        if (!botIsAdmin) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                chatType: 'GROUP',
                target: targetJid,
                result: 'DENIED',
                details: 'O bot não possui privilégios de administrador no grupo solicitado.'
            });
            return {
                success: false,
                message: 'Não consigo executar essa ação porque não tenho permissões de administrador nesse grupo.',
                auditStatus: 'DENIED'
            };
        }

        try {
            const cleanTarget = targetJid.includes('@') ? targetJid : `${targetJid}@s.whatsapp.net`;
            await sock.groupParticipantsUpdate(groupId, [cleanTarget], 'remove');

            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MEMBER_REMOVE',
                chatId: groupId,
                chatType: 'GROUP',
                target: cleanTarget,
                result: 'SUCCESS',
                duration: Date.now() - startTime,
                details: `Participante ${cleanTarget} removido com sucesso.`
            });

            return {
                success: true,
                message: `Participante removido do grupo com sucesso.`,
                auditStatus: 'SUCCESS'
            };
        } catch (err: any) {
            console.error(`[ActionExecutor] Erro ao remover participante ${targetJid}:`, err);
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MEMBER_REMOVE_FAILED',
                chatId: groupId,
                chatType: 'GROUP',
                target: targetJid,
                result: 'ERROR',
                errorMessage: err.message
            });
            return {
                success: false,
                message: 'Não foi possível remover o participante. Verifique se ele ainda está no grupo.',
                error: err.message,
                auditStatus: 'ERROR'
            };
        }
    }

    /**
     * Promotes a participant to administrator.
     */
    static async promoteParticipant(params: ActionExecutorParams & {
        groupId: string;
        targetJid: string;
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, currentBot, groupId, targetJid } = params;
        const startTime = Date.now();

        if (!sock) return { success: false, message: 'WhatsApp desconectado.', auditStatus: 'ERROR' };

        if (actorRole !== 'OWNER' && actorRole !== 'ADMIN' && !hasPermission(currentBot, 'GROUP_MEMBER_PROMOTE')) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                result: 'DENIED',
                details: 'Sem permissão GROUP_MEMBER_PROMOTE'
            });
            return { success: false, message: 'Você não tem permissão para promover administradores.', auditStatus: 'DENIED' };
        }

        const botIsAdmin = await isBotGroupAdmin(sock, groupId);
        if (!botIsAdmin) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                result: 'DENIED',
                details: 'Bot não é administrador para promover membros.'
            });
            return { success: false, message: 'Não consigo executar essa ação porque não tenho permissões de administrador nesse grupo.', auditStatus: 'DENIED' };
        }

        try {
            const cleanTarget = targetJid.includes('@') ? targetJid : `${targetJid}@s.whatsapp.net`;
            await sock.groupParticipantsUpdate(groupId, [cleanTarget], 'promote');

            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MEMBER_PROMOTE',
                chatId: groupId,
                target: cleanTarget,
                result: 'SUCCESS',
                duration: Date.now() - startTime
            });
            return { success: true, message: 'Membro promovido a administrador com sucesso.', auditStatus: 'SUCCESS' };
        } catch (err: any) {
            return { success: false, message: 'Não foi possível promover o membro.', error: err.message, auditStatus: 'ERROR' };
        }
    }

    /**
     * Demotes an administrator to normal participant.
     */
    static async demoteParticipant(params: ActionExecutorParams & {
        groupId: string;
        targetJid: string;
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, currentBot, groupId, targetJid } = params;
        const startTime = Date.now();

        if (!sock) return { success: false, message: 'WhatsApp desconectado.', auditStatus: 'ERROR' };

        if (actorRole !== 'OWNER' && actorRole !== 'ADMIN' && !hasPermission(currentBot, 'GROUP_MEMBER_DEMOTE')) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                result: 'DENIED',
                details: 'Sem permissão GROUP_MEMBER_DEMOTE'
            });
            return { success: false, message: 'Você não tem permissão para rebaixar administradores.', auditStatus: 'DENIED' };
        }

        const botIsAdmin = await isBotGroupAdmin(sock, groupId);
        if (!botIsAdmin) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                result: 'DENIED',
                details: 'Bot não é administrador para rebaixar membros.'
            });
            return { success: false, message: 'Não consigo executar essa ação porque não tenho permissões de administrador nesse grupo.', auditStatus: 'DENIED' };
        }

        try {
            const cleanTarget = targetJid.includes('@') ? targetJid : `${targetJid}@s.whatsapp.net`;
            await sock.groupParticipantsUpdate(groupId, [cleanTarget], 'demote');

            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_MEMBER_DEMOTE',
                chatId: groupId,
                target: cleanTarget,
                result: 'SUCCESS',
                duration: Date.now() - startTime
            });
            return { success: true, message: 'Administrador rebaixado a participante com sucesso.', auditStatus: 'SUCCESS' };
        } catch (err: any) {
            return { success: false, message: 'Não foi possível rebaixar o participante.', error: err.message, auditStatus: 'ERROR' };
        }
    }

    /**
     * Changes group settings (e.g. only admins can send messages, or edit group info).
     */
    static async changeGroupSettings(params: ActionExecutorParams & {
        groupId: string;
        setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked';
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, currentBot, groupId, setting } = params;

        if (!sock) return { success: false, message: 'WhatsApp desconectado.', auditStatus: 'ERROR' };

        const botIsAdmin = await isBotGroupAdmin(sock, groupId);
        if (!botIsAdmin) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'ACTION_PERMISSION_DENIED',
                chatId: groupId,
                result: 'DENIED',
                details: 'Bot não é administrador para alterar configurações do grupo.'
            });
            return { success: false, message: 'Não consigo executar essa ação porque não tenho permissões de administrador nesse grupo.', auditStatus: 'DENIED' };
        }

        try {
            await sock.groupSettingUpdate(groupId, setting);
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'GROUP_SETTINGS_UPDATE',
                chatId: groupId,
                result: 'SUCCESS',
                details: `Configuração do grupo alterada para: ${setting}`
            });
            return { success: true, message: 'Configuração do grupo atualizada com sucesso.', auditStatus: 'SUCCESS' };
        } catch (err: any) {
            return { success: false, message: 'Não foi possível alterar a configuração do grupo.', error: err.message, auditStatus: 'ERROR' };
        }
    }

    /**
     * Deletes a message (message revocation).
     */
    static async deleteMessage(params: ActionExecutorParams & {
        chatId: string;
        messageKey: { id: string; remoteJid: string; fromMe: boolean; participant?: string };
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, currentBot, chatId, messageKey } = params;

        if (!sock) return { success: false, message: 'WhatsApp desconectado.', auditStatus: 'ERROR' };

        // If deleting someone else's message in a group, bot must be admin
        if (!messageKey.fromMe && chatId.endsWith('@g.us')) {
            const botIsAdmin = await isBotGroupAdmin(sock, chatId);
            if (!botIsAdmin) {
                return {
                    success: false,
                    message: 'Não consigo apagar mensagens de outros participantes sem privilégios de administrador.',
                    auditStatus: 'DENIED'
                };
            }
        }

        try {
            await sock.sendMessage(chatId, { delete: messageKey });
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'MESSAGE_DELETED',
                chatId,
                result: 'SUCCESS',
                details: `Mensagem ${messageKey.id} apagada.`
            });
            return { success: true, message: 'Mensagem apagada com sucesso.', auditStatus: 'SUCCESS' };
        } catch (err: any) {
            return { success: false, message: 'Falha ao apagar mensagem.', error: err.message, auditStatus: 'ERROR' };
        }
    }

    /**
     * Sends a direct private message to an authorized recipient.
     */
    static async sendPrivateMessage(params: ActionExecutorParams & {
        recipientJid: string;
        message: string;
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, recipientJid, message } = params;

        if (!sock) return { success: false, message: 'WhatsApp desconectado.', auditStatus: 'ERROR' };

        try {
            await sock.sendMessage(recipientJid, { text: message.trim() });
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'PRIVATE_MESSAGE_SEND',
                chatId: recipientJid,
                result: 'SUCCESS',
                details: 'Mensagem privada enviada com sucesso.'
            });
            return { success: true, message: 'Mensagem privada enviada com sucesso.', auditStatus: 'SUCCESS' };
        } catch (err: any) {
            return { success: false, message: 'Falha ao enviar mensagem privada.', error: err.message, auditStatus: 'ERROR' };
        }
    }

    /**
     * Sends a document (such as a PDF) to a group or private contact with real Baileys confirmation and auditing.
     */
    static async sendDocument(params: ActionExecutorParams & {
        targetJid: string;
        documentBuffer: Buffer;
        fileName: string;
        mimetype?: string;
        caption?: string;
    }): Promise<ActionResult> {
        const { botId, actorJid, actorRole, sock, firestoreDb, targetJid, documentBuffer, fileName, mimetype, caption } = params;
        const startTime = Date.now();

        if (!sock) return { success: false, message: 'WhatsApp desconectado.', auditStatus: 'ERROR' };

        if (!targetJid || (!targetJid.endsWith('@g.us') && !targetJid.endsWith('@s.whatsapp.net'))) {
            return {
                success: false,
                message: `Destinatário inválido para envio de documento: ${targetJid}`,
                auditStatus: 'ERROR'
            };
        }

        if (!documentBuffer || documentBuffer.length === 0) {
            return {
                success: false,
                message: 'O documento gerado está vazio.',
                auditStatus: 'ERROR'
            };
        }

        try {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'DOCUMENT_SEND_ATTEMPT',
                chatId: targetJid,
                chatType: targetJid.endsWith('@g.us') ? 'GROUP' : 'PRIVATE',
                result: 'SUCCESS',
                details: `Tentativa de envio do documento ${fileName} (${documentBuffer.length} bytes)`
            });

            const sentDoc = await sock.sendMessage(targetJid, {
                document: documentBuffer,
                mimetype: mimetype || 'application/pdf',
                fileName: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
                caption: caption || undefined
            });

            const messageId = sentDoc?.key?.id;
            if (!messageId) {
                throw new Error('Baileys não retornou confirmação de entrega do documento.');
            }

            const duration = Date.now() - startTime;
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'DOCUMENT_SEND_SUCCESS',
                chatId: targetJid,
                chatType: targetJid.endsWith('@g.us') ? 'GROUP' : 'PRIVATE',
                result: 'SUCCESS',
                duration,
                messageId,
                details: `Documento ${fileName} enviado com sucesso (ID: ${messageId}).`
            });

            return {
                success: true,
                message: `Documento "${fileName}" enviado com sucesso!`,
                data: { messageId, durationMs: duration },
                auditStatus: 'SUCCESS'
            };
        } catch (err: any) {
            console.error(`[ActionExecutor] Erro ao enviar documento para ${targetJid}:`, err);
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: actorJid,
                actorRole,
                action: 'DOCUMENT_SEND_FAILED',
                chatId: targetJid,
                chatType: targetJid.endsWith('@g.us') ? 'GROUP' : 'PRIVATE',
                result: 'ERROR',
                errorMessage: err.message,
                details: `Falha técnica ao enviar documento ${fileName} para ${targetJid}: ${err.message}`
            });
            return {
                success: false,
                message: `Não foi possível enviar o documento: ${err.message}`,
                error: err.message,
                auditStatus: 'ERROR'
            };
        }
    }
}
