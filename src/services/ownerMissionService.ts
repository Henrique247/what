import { Firestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { recordAuditLog } from '../audit';
import { getBotGroups, getBotGroupSummary, BotGroupItem } from './botKnowledgeService';
import { ActionExecutor } from './actionExecutor';

export type MissionStep = 
    | 'IDLE'
    | 'SELECTING_ACTION'
    | 'SELECTING_GROUP'
    | 'SELECTING_MEMBER_SUB_ACTION'
    | 'COLLECTING_TARGET'
    | 'COLLECTING_MESSAGE'
    | 'CONFIRMING'
    | 'EXECUTING'
    | 'SUCCESS'
    | 'FAILED';

export interface OwnerMission {
    botId: string;
    ownerJid: string;
    step: MissionStep;
    actionType?: 
        | 'SEND_GROUP_MESSAGE'
        | 'REMOVE_MEMBER'
        | 'PROMOTE_MEMBER'
        | 'DEMOTE_MEMBER'
        | 'VIEW_GROUP_ADMINS'
        | 'VIEW_GROUP_MEMBERS'
        | 'CLEAR_MEMORY';
    selectedGroupId?: string;
    selectedGroupName?: string;
    targetUser?: string;
    pendingMessage?: string;
    availableGroups?: BotGroupItem[];
    createdAt: number;
    updatedAt: number;
}

const MISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

// In-memory mission store: key = `${botId}:${normalizedOwnerJid}`
const activeMissions = new Map<string, OwnerMission>();

function getMissionKey(botId: string, ownerJid: string): string {
    const cleanJid = ownerJid.split(':')[0].toLowerCase();
    return `${botId}:${cleanJid}`;
}

export function generateMainMenuText(botName: string): string {
    return `🤖 *PAINEL DO BOT*

1. Estado do bot
2. Meus grupos
3. Grupos onde sou administrador
4. Enviar mensagem para grupo
5. Gerir membros
6. Moderação
7. Memória
8. Base de conhecimento
9. Mensagens automáticas
10. Configurações
11. Estatísticas
12. Ajuda

_Responda com o número da opção (ou digite 0 para cancelar)._`;
}

export function generateMemberSubMenuText(groupName: string): string {
    return `👥 *GERIR MEMBROS — ${groupName}*

1. Remover membro
2. Promover administrador
3. Remover administrador
4. Ver administradores
5. Ver participantes

_Responda com o número da opção desejada._`;
}

/**
 * Handles incoming owner WhatsApp input for the interactive mission state machine.
 */
export async function handleOwnerMissionInput(opts: {
    botId: string;
    ownerJid: string;
    text: string;
    sock: any;
    firestoreDb: Firestore;
    currentBot: any;
    sendReply: (content: { text: string }) => Promise<any>;
}): Promise<{ handled: boolean; finalActionTaken?: boolean }> {
    const { botId, ownerJid, text, sock, firestoreDb, currentBot, sendReply } = opts;
    const cleanText = (text || '').trim();
    const missionKey = getMissionKey(botId, ownerJid);
    const existing = activeMissions.get(missionKey);

    // 1. Cancel mission triggers
    if (cleanText === '0' || cleanText.toLowerCase() === 'cancelar' || cleanText.toLowerCase() === '!cancelar') {
        if (existing) {
            activeMissions.delete(missionKey);
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: ownerJid,
                actorRole: 'OWNER',
                action: 'MISSION_CANCELLED',
                result: 'SUCCESS',
                details: 'Proprietário cancelou a missão ativa.'
            });
            await sendReply({ text: '🚫 Operação cancelada. Estou à disposição!' });
            return { handled: true };
        }
        return { handled: false };
    }

    // 2. Trigger menu command (/menu, menu, !menu, painel)
    const isMenuTrigger = ['/menu', 'menu', '!menu', 'painel', '/painel'].includes(cleanText.toLowerCase());

    if (isMenuTrigger) {
        // Start or reset mission to SELECTING_ACTION
        const mission: OwnerMission = {
            botId,
            ownerJid,
            step: 'SELECTING_ACTION',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        activeMissions.set(missionKey, mission);

        await recordAuditLog(firestoreDb, {
            botId,
            actorId: ownerJid,
            actorRole: 'OWNER',
            action: 'MISSION_MENU_OPENED',
            result: 'SUCCESS',
            details: 'Proprietário abriu o menu de missões interativas.'
        });

        const botName = currentBot?.name || 'Assistente TechStar';
        await sendReply({ text: generateMainMenuText(botName) });
        return { handled: true };
    }

    // 3. Direct Command: "Enviar <índice> <mensagem>" (ex: "Enviar 13 Estou a funcionar")
    const sendByIndexMatch = cleanText.match(/^(?:\/|!)?(?:enviar|mandar|postar)\s+(\d+)\s+([\s\S]+)$/i);
    if (sendByIndexMatch) {
        const groupIndex = parseInt(sendByIndexMatch[1], 10);
        const messageToSend = sendByIndexMatch[2].trim();

        if (!messageToSend) {
            await sendReply({ text: '❌ A mensagem não pode estar vazia. Exemplo: *Enviar 13 Estou a funcionar*' });
            return { handled: true };
        }

        const groups = await getBotGroups(botId, firestoreDb, sock, currentBot, true);
        if (groups.length === 0) {
            await sendReply({ text: '❌ O bot não está presente em nenhum grupo no momento.' });
            return { handled: true };
        }

        const targetIdx = groupIndex - 1;
        if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= groups.length) {
            await sendReply({
                text: `❌ Grupo de índice *${groupIndex}* não encontrado.\n\nO bot participa de *${groups.length}* grupo(s) (índices válidos: 1 a ${groups.length}).\nDigite */grupos* para ver a listagem numerada atualizada.`
            });
            return { handled: true };
        }

        const targetGroup = groups[targetIdx];
        if (!targetGroup.groupId || !targetGroup.groupId.endsWith('@g.us')) {
            await sendReply({
                text: `❌ O grupo selecionado (*${targetGroup.groupName}*) possui um identificador inválido (${targetGroup.groupId}).`
            });
            return { handled: true };
        }

        // Execute real action via ActionExecutor
        const result = await ActionExecutor.sendGroupMessage({
            botId,
            actorJid: ownerJid,
            actorRole: 'OWNER',
            sock,
            firestoreDb,
            currentBot,
            groupId: targetGroup.groupId,
            message: messageToSend
        });

        if (result.success) {
            const msgIdNote = result.data?.messageId ? ` (ID: ${result.data.messageId})` : '';
            await sendReply({
                text: `✅ Mensagem enviada com êxito para o grupo *${targetGroup.groupName}* (índice ${groupIndex})${msgIdNote}:\n\n"${messageToSend}"`
            });
        } else {
            await sendReply({
                text: `❌ Falha ao enviar mensagem para o grupo *${targetGroup.groupName}*: ${result.message}`
            });
        }
        return { handled: true, finalActionTaken: true };
    }

    // 4. Direct Command: "/grupos" or "grupos"
    if (['/grupos', 'grupos', '!grupos'].includes(cleanText.toLowerCase())) {
        const groups = await getBotGroups(botId, firestoreDb, sock, currentBot, true);
        if (groups.length === 0) {
            await sendReply({ text: '📁 Atualmente o bot não está presente em nenhum grupo.' });
        } else {
            const list = groups.slice(0, 30).map((g, i) => `${i + 1}. ${g.botIsAdmin ? '👑' : '👥'} *${g.groupName}* (${g.participantCount} membros)`).join('\n');
            const more = groups.length > 30 ? `\n... e mais ${groups.length - 30} grupos.` : '';
            await sendReply({ text: `📁 *Meus Grupos Conectados (${groups.length})*\n\n${list}${more}\n\n_Para enviar mensagem direta, digite: Enviar <número> <sua mensagem>_` });
        }
        return { handled: true };
    }

    // 5. Direct Command: "/admin_grupos" or "/grupos_admin"
    if (['/admin_grupos', '/grupos_admin', 'grupos admin', '!admin_grupos'].includes(cleanText.toLowerCase())) {
        const groups = await getBotGroups(botId, firestoreDb, sock, currentBot, true);
        const admins = groups.filter(g => g.botIsAdmin);
        if (admins.length === 0) {
            await sendReply({ text: `👑 O bot não possui permissão de administrador em nenhum dos seus ${groups.length} grupos.` });
        } else {
            const list = admins.slice(0, 30).map((g, i) => `${i + 1}. 👑 *${g.groupName}* (${g.participantCount} membros)`).join('\n');
            const more = admins.length > 30 ? `\n... e mais ${admins.length - 30} grupos.` : '';
            await sendReply({ text: `👑 *Grupos onde sou Administrador (${admins.length})*\n\n${list}${more}` });
        }
        return { handled: true };
    }

    // If no active mission, pass through to other handlers
    if (!existing) {
        return { handled: false };
    }

    // Check timeout (5 minutes)
    if (Date.now() - existing.updatedAt > MISSION_TIMEOUT_MS) {
        activeMissions.delete(missionKey);
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: ownerJid,
            actorRole: 'OWNER',
            action: 'MISSION_EXPIRED',
            result: 'SUCCESS',
            details: 'Missão do proprietário expirou por inatividade de 5 minutos.'
        });
        await sendReply({ text: '⏱️ Sua sessão de menu anterior expirou por inatividade. Digite */menu* para abrir novamente.' });
        return { handled: true };
    }

    existing.updatedAt = Date.now();

    // 3. STATE MACHINE HANDLING
    switch (existing.step) {
        case 'SELECTING_ACTION': {
            const opt = parseInt(cleanText, 10);
            if (isNaN(opt) || opt < 1 || opt > 12) {
                await sendReply({ text: 'Por favor, escolha uma opção válida de *1 a 12* (ou digite *0* para cancelar).' });
                return { handled: true };
            }

            switch (opt) {
                case 1: { // 1. Estado do bot
                    activeMissions.delete(missionKey);
                    const isConnected = !!sock;
                    const botName = currentBot.name || 'Assistente TechStar';
                    const summary = await getBotGroupSummary(botId, firestoreDb, sock, currentBot);
                    await sendReply({
                        text: `⚡ *Estado do Bot*\n\n• *Nome:* ${botName}\n• *Conexão:* ${isConnected ? '🟢 Conectado e Operacional' : '🔴 Desconectado'}\n• *Total de Grupos:* ${summary.totalGroups} (${summary.adminGroups} onde é administrador)\n• *Modo:* Multi-Tenant Seguro\n• *Horário Local:* ${new Date().toLocaleTimeString('pt-PT')}`
                    });
                    return { handled: true };
                }

                case 2: { // 2. Meus grupos
                    activeMissions.delete(missionKey);
                    const groups = await getBotGroups(botId, firestoreDb, sock, currentBot);
                    if (groups.length === 0) {
                        await sendReply({ text: '📁 Atualmente o bot não está presente em nenhum grupo.' });
                    } else {
                        const list = groups.slice(0, 25).map((g, i) => `${i + 1}. ${g.botIsAdmin ? '👑' : '👥'} *${g.groupName}* (${g.participantCount} membros)`).join('\n');
                        const more = groups.length > 25 ? `\n... e mais ${groups.length - 25} grupos.` : '';
                        await sendReply({ text: `📁 *Meus Grupos (${groups.length})*\n\n${list}${more}` });
                    }
                    return { handled: true };
                }

                case 3: { // 3. Grupos onde sou administrador
                    activeMissions.delete(missionKey);
                    const groups = await getBotGroups(botId, firestoreDb, sock, currentBot);
                    const admins = groups.filter(g => g.botIsAdmin);
                    if (admins.length === 0) {
                        await sendReply({ text: `👑 O bot não possui permissão de administrador em nenhum dos seus ${groups.length} grupos.` });
                    } else {
                        const list = admins.slice(0, 25).map((g, i) => `${i + 1}. 👑 *${g.groupName}* (${g.participantCount} membros)`).join('\n');
                        const more = admins.length > 25 ? `\n... e mais ${admins.length - 25} grupos administrados.` : '';
                        await sendReply({ text: `👑 *Grupos onde sou Administrador (${admins.length})*\n\n${list}${more}` });
                    }
                    return { handled: true };
                }

                case 4: { // 4. Enviar mensagem para grupo
                    const groups = await getBotGroups(botId, firestoreDb, sock, currentBot);
                    if (groups.length === 0) {
                        activeMissions.delete(missionKey);
                        await sendReply({ text: '❌ O bot não está em nenhum grupo para envio de mensagens.' });
                        return { handled: true };
                    }

                    existing.actionType = 'SEND_GROUP_MESSAGE';
                    existing.availableGroups = groups;
                    existing.step = 'SELECTING_GROUP';

                    const groupOptions = groups.slice(0, 20).map((g, idx) => `${idx + 1}. *${g.groupName}*`).join('\n');
                    await sendReply({
                        text: `📢 *Escolha o grupo de destino:*\n\n${groupOptions}\n\n_Digite o número do grupo (ou 0 para cancelar):_`
                    });
                    return { handled: true };
                }

                case 5: { // 5. Gerir membros
                    const groups = await getBotGroups(botId, firestoreDb, sock, currentBot);
                    if (groups.length === 0) {
                        activeMissions.delete(missionKey);
                        await sendReply({ text: '❌ O bot não está em nenhum grupo no momento.' });
                        return { handled: true };
                    }

                    existing.availableGroups = groups;
                    existing.step = 'SELECTING_GROUP';
                    existing.actionType = 'REMOVE_MEMBER'; // Default flow, will show member submenu next

                    const groupOptions = groups.slice(0, 20).map((g, idx) => `${idx + 1}. ${g.botIsAdmin ? '👑' : '👥'} *${g.groupName}*`).join('\n');
                    await sendReply({
                        text: `👥 *Escolha o grupo para gerir membros:*\n\n${groupOptions}\n\n_Digite o número do grupo:_`
                    });
                    return { handled: true };
                }

                case 6: { // 6. Moderação
                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: `🛡️ *Configurações de Moderação*\n\nAs proteções de anti-link, anti-spam, palavras proibidas e advertências são configuradas por grupo no Painel Web ou via comandos diretos no grupo.\n\n_Para gerir pelo WhatsApp, acesse o grupo e digite !config ou use o menu do proprietário._`
                    });
                    return { handled: true };
                }

                case 7: { // 7. Memória
                    activeMissions.delete(missionKey);
                    const memEnabled = currentBot.memoryEnabled !== 0 && currentBot.memoryEnabled !== false;
                    await sendReply({
                        text: `🧠 *Memória do Bot*\n\n• *Status:* ${memEnabled ? 'Ativada' : 'Desativada'}\n• *Isolamento:* Memória privada isolada de conversas de grupo.\n\nPara limpar o histórico recente de uma conversa, digite */reset* na conversa correspondente.`
                    });
                    return { handled: true };
                }

                case 8: { // 8. Base de conhecimento
                    activeMissions.delete(missionKey);
                    const kb = currentBot.knowledgeBase ? `${currentBot.knowledgeBase.substring(0, 200)}...` : 'Nenhum texto cadastrado.';
                    await sendReply({
                        text: `📚 *Base de Conhecimento*\n\n${kb}\n\n_Para atualizar o conteúdo completo, utilize a aba Conhecimento no Painel Web do seu bot._`
                    });
                    return { handled: true };
                }

                case 9: { // 9. Mensagens automáticas
                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: `⏰ *Mensagens Automáticas & Motivação*\n\n• Boas-vindas Privadas: ${currentBot.privateWelcomeEnabled ? 'Ativadas' : 'Desativadas'}\n• Despedida Privada: ${currentBot.privateExitEnabled ? 'Ativada' : 'Desativada'}\n• Motivação Diária: Configurável individualmente em cada grupo no fuso de Luanda (Africa/Luanda).`
                    });
                    return { handled: true };
                }

                case 10: { // 10. Configurações
                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: `⚙️ *Configurações Principais*\n\n• *Nome:* ${currentBot.name}\n• *Respostas Privadas:* ${currentBot.respondInPrivate !== 0 ? 'Sim' : 'Não'}\n• *Respostas em Grupos:* ${currentBot.respondInGroups !== 0 ? 'Sim' : 'Não'}\n• *Análise de Mídia:* ${currentBot.analysisEnabled ? 'Sim' : 'Não'}`
                    });
                    return { handled: true };
                }

                case 11: { // 11. Estatísticas
                    activeMissions.delete(missionKey);
                    const summary = await getBotGroupSummary(botId, firestoreDb, sock, currentBot);
                    await sendReply({
                        text: `📊 *Estatísticas Operacionais*\n\n• *Grupos Conectados:* ${summary.totalGroups}\n• *Grupos Administrados:* ${summary.adminGroups}\n• *Grupos como Membro:* ${summary.memberGroups}\n• *Última Sincronização:* ${new Date().toLocaleTimeString('pt-PT')}`
                    });
                    return { handled: true };
                }

                case 12: { // 12. Ajuda
                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: `💡 *Ajuda Rápida do Proprietário*\n\n• */menu* — Abre o painel interativo numerado\n• */status* — Estado geral da conexão\n• */grupos* — Lista todos os grupos conectados\n• */sair* — Encerra interações ativas\n• Digite *0* a qualquer momento para cancelar uma operação.`
                    });
                    return { handled: true };
                }
            }
            return { handled: true };
        }

        case 'SELECTING_GROUP': {
            const idx = parseInt(cleanText, 10) - 1;
            const groups = existing.availableGroups || [];

            if (isNaN(idx) || idx < 0 || idx >= groups.length) {
                await sendReply({ text: `Escolha um número válido entre 1 e ${groups.length} (ou 0 para cancelar).` });
                return { handled: true };
            }

            const chosen = groups[idx];
            existing.selectedGroupId = chosen.groupId;
            existing.selectedGroupName = chosen.groupName;

            if (existing.actionType === 'SEND_GROUP_MESSAGE') {
                existing.step = 'COLLECTING_MESSAGE';
                await sendReply({
                    text: `✍️ *Digite a mensagem* que deseja enviar para o grupo *${chosen.groupName}*:`
                });
                return { handled: true };
            }

            // If coming from "Gerir membros" (opção 5), show member submenu
            existing.step = 'SELECTING_MEMBER_SUB_ACTION';
            await sendReply({
                text: generateMemberSubMenuText(chosen.groupName)
            });
            return { handled: true };
        }

        case 'SELECTING_MEMBER_SUB_ACTION': {
            const subOpt = parseInt(cleanText, 10);
            if (isNaN(subOpt) || subOpt < 1 || subOpt > 5) {
                await sendReply({ text: 'Por favor, escolha uma opção válida de *1 a 5*.' });
                return { handled: true };
            }

            const groupId = existing.selectedGroupId!;
            const groupName = existing.selectedGroupName || 'Grupo';

            if (subOpt === 4) { // Ver administradores
                activeMissions.delete(missionKey);
                try {
                    const metadata = await sock.groupMetadata(groupId);
                    const admins = metadata.participants.filter((p: any) => p.admin);
                    const adminList = admins.map((a: any, i: number) => `${i + 1}. ${a.id.split('@')[0]} (${a.admin})`).join('\n');
                    await sendReply({
                        text: `👑 *Administradores de ${groupName}:*\n\n${adminList || 'Nenhum administrador encontrado.'}`
                    });
                } catch {
                    await sendReply({ text: 'Não foi possível consultar os administradores desse grupo no momento.' });
                }
                return { handled: true };
            }

            if (subOpt === 5) { // Ver participantes
                activeMissions.delete(missionKey);
                try {
                    const metadata = await sock.groupMetadata(groupId);
                    const total = metadata.participants?.length || 0;
                    const preview = metadata.participants.slice(0, 15).map((p: any, i: number) => `${i + 1}. ${p.id.split('@')[0]}${p.admin ? ' 👑' : ''}`).join('\n');
                    await sendReply({
                        text: `👥 *Participantes de ${groupName} (${total}):*\n\n${preview}${total > 15 ? `\n... e mais ${total - 15} membros.` : ''}`
                    });
                } catch {
                    await sendReply({ text: 'Não foi possível consultar os participantes desse grupo no momento.' });
                }
                return { handled: true };
            }

            // Actions requiring target: 1 (remover), 2 (promover), 3 (rebaixar)
            if (subOpt === 1) existing.actionType = 'REMOVE_MEMBER';
            if (subOpt === 2) existing.actionType = 'PROMOTE_MEMBER';
            if (subOpt === 3) existing.actionType = 'DEMOTE_MEMBER';

            existing.step = 'COLLECTING_TARGET';
            await sendReply({
                text: `📞 *Envie o número de telefone* do membro (com código do país, ex: 244923000111) ou mencione o contato:`
            });
            return { handled: true };
        }

        case 'COLLECTING_TARGET': {
            const rawTarget = cleanText.replace(/\D/g, '');
            if (rawTarget.length < 8) {
                await sendReply({ text: 'Número inválido. Por favor, envie um número completo com código do país (ex: 244923000111).' });
                return { handled: true };
            }

            const targetJid = `${rawTarget}@s.whatsapp.net`;
            existing.targetUser = targetJid;
            existing.step = 'CONFIRMING';

            const actionLabel = existing.actionType === 'REMOVE_MEMBER' 
                ? 'remover este membro'
                : (existing.actionType === 'PROMOTE_MEMBER' ? 'promover este membro a administrador' : 'rebaixar este administrador');

            await sendReply({
                text: `⚠️ *Confirmação de Ação Administrativa*\n\nVocê confirma que deseja ${actionLabel} (*${rawTarget}*) no grupo *${existing.selectedGroupName}*?\n\n1. Confirmar\n2. Cancelar`
            });
            return { handled: true };
        }

        case 'COLLECTING_MESSAGE': {
            if (!cleanText) {
                await sendReply({ text: 'A mensagem não pode ser vazia. Digite o texto desejado:' });
                return { handled: true };
            }

            existing.pendingMessage = cleanText;
            existing.step = 'CONFIRMING';

            await sendReply({
                text: `📢 *Confirma o envio para o grupo ${existing.selectedGroupName}?*\n\n"${cleanText}"\n\n1. Confirmar\n2. Cancelar`
            });
            return { handled: true };
        }

        case 'CONFIRMING': {
            const choice = cleanText.toLowerCase();
            if (choice === '1' || choice === 'confirmar' || choice === 'sim') {
                existing.step = 'EXECUTING';
                const groupId = existing.selectedGroupId!;
                const groupName = existing.selectedGroupName || 'Grupo';

                // Enviar mensagem
                if (existing.actionType === 'SEND_GROUP_MESSAGE' && existing.pendingMessage) {
                    const result = await ActionExecutor.sendGroupMessage({
                        botId,
                        actorJid: ownerJid,
                        actorRole: 'OWNER',
                        sock,
                        firestoreDb,
                        currentBot,
                        groupId,
                        message: existing.pendingMessage
                    });

                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: result.success 
                            ? `✅ Mensagem enviada com sucesso para o grupo *${groupName}*!`
                            : `❌ ${result.message}`
                    });
                    return { handled: true, finalActionTaken: true };
                }

                // Remover membro
                if (existing.actionType === 'REMOVE_MEMBER' && existing.targetUser) {
                    const result = await ActionExecutor.removeGroupParticipant({
                        botId,
                        actorJid: ownerJid,
                        actorRole: 'OWNER',
                        sock,
                        firestoreDb,
                        currentBot,
                        groupId,
                        targetJid: existing.targetUser
                    });

                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: result.success
                            ? `✅ Membro removido do grupo *${groupName}* com sucesso.`
                            : `❌ ${result.message}`
                    });
                    return { handled: true, finalActionTaken: true };
                }

                // Promover membro
                if (existing.actionType === 'PROMOTE_MEMBER' && existing.targetUser) {
                    const result = await ActionExecutor.promoteParticipant({
                        botId,
                        actorJid: ownerJid,
                        actorRole: 'OWNER',
                        sock,
                        firestoreDb,
                        currentBot,
                        groupId,
                        targetJid: existing.targetUser
                    });

                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: result.success
                            ? `✅ Membro promovido a administrador em *${groupName}*.`
                            : `❌ ${result.message}`
                    });
                    return { handled: true, finalActionTaken: true };
                }

                // Rebaixar membro
                if (existing.actionType === 'DEMOTE_MEMBER' && existing.targetUser) {
                    const result = await ActionExecutor.demoteParticipant({
                        botId,
                        actorJid: ownerJid,
                        actorRole: 'OWNER',
                        sock,
                        firestoreDb,
                        currentBot,
                        groupId,
                        targetJid: existing.targetUser
                    });

                    activeMissions.delete(missionKey);
                    await sendReply({
                        text: result.success
                            ? `✅ Administrador rebaixado em *${groupName}*.`
                            : `❌ ${result.message}`
                    });
                    return { handled: true, finalActionTaken: true };
                }

                activeMissions.delete(missionKey);
                await sendReply({ text: 'Ação concluída.' });
                return { handled: true };
            }

            if (choice === '2' || choice === 'cancelar' || choice === 'nao' || choice === 'não') {
                activeMissions.delete(missionKey);
                await sendReply({ text: '🚫 Operação cancelada pelo proprietário.' });
                return { handled: true };
            }

            await sendReply({ text: 'Responda *1* para Confirmar ou *2* para Cancelar.' });
            return { handled: true };
        }

        default:
            return { handled: false };
    }
}
