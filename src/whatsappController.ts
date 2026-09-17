import { doc, updateDoc, setDoc, deleteDoc, collection, getDocs, getDoc, writeBatch, Firestore, query, orderBy, limit } from 'firebase/firestore';
import { isPhoneMatch, normalizePhone, hasPermission, PERMISSIONS } from './security';
import { recordAuditLog, fetchAuditLogs } from './audit';
import { GoogleGenAI } from '@google/genai';
import { getGroupConfig, getGroupMeta, recordGroupLog, isBotParticipantAdmin } from './services/groupModeration';
import { scheduleGroupMotivation } from './services/groupScheduler';
import { GroupConfig } from './types';

export interface PendingConfirmation {
    action: 'CLEAR_KNOWLEDGE' | 'CLEAR_HISTORY' | 'RESET_SESSION' | 'UPDATE_WELCOME_MSG';
    description: string;
    payload?: any;
    expiresAt: number;
}

// In-Memory state for Owner sessions and pending critical confirmations
export const ownerModeSessions = new Map<string, boolean>();
export const pendingConfirmations = new Map<string, PendingConfirmation>();

export function getSessionKey(botId: string, senderJid: string): string {
    return `${botId}:${normalizePhone(senderJid)}`;
}

/**
 * Parses natural language input from the owner into structured intents.
 * Uses strict pattern recognition and optionally Gemini for complex phrasing.
 */
export async function parseOwnerIntent(
    text: string, 
    geminiKey?: string
): Promise<{ intent: string; value?: any } | null> {
    const clean = text.trim();
    const lower = clean.toLowerCase();

    // 1. Exact or regex-based fast recognition
    if (/^(?:ativa|ativar)\s+(?:a\s+)?mem[oó]ria(?:\s+de\s+contexto)?$/i.test(lower)) {
        return { intent: 'UPDATE_MEMORY', value: true };
    }
    if (/^(?:desativa|desativar)\s+(?:a\s+)?mem[oó]ria(?:\s+de\s+contexto)?$/i.test(lower)) {
        return { intent: 'UPDATE_MEMORY', value: false };
    }
    if (/^(?:ativa|ativar)\s+(?:os\s+)?grupos?(?:\s+respostas)?$/i.test(lower) || /^(?:ativa|ativar)\s+respostas\s+em\s+grupos?$/i.test(lower)) {
        return { intent: 'UPDATE_GROUPS', value: true };
    }
    if (/^(?:desativa|desativar)\s+(?:os\s+)?grupos?(?:\s+respostas)?$/i.test(lower) || /^(?:desativa|desativar)\s+respostas\s+em\s+grupos?$/i.test(lower)) {
        return { intent: 'UPDATE_GROUPS', value: false };
    }
    if (/^(?:ativa|ativar)\s+(?:as\s+)?respostas?\s+privadas?$/i.test(lower) || /^(?:ativa|ativar)\s+(?:o\s+)?privado$/i.test(lower)) {
        return { intent: 'UPDATE_PRIVATE', value: true };
    }
    if (/^(?:desativa|desativar)\s+(?:as\s+)?respostas?\s+privadas?$/i.test(lower) || /^(?:desativa|desativar)\s+(?:o\s+)?privado$/i.test(lower)) {
        return { intent: 'UPDATE_PRIVATE', value: false };
    }
    if (/^(?:mostra|mostrar|qual|ver)\s+(?:o\s+)?(?:estado|status)\s+do\s+bot\??$/i.test(lower) || lower === 'estado do bot' || lower === 'status do bot') {
        return { intent: 'GET_STATUS' };
    }
    if (/^(?:quantas\s+mensagens|mostra\s+as\s+estat[ií]sticas|ver\s+estat[ií]sticas|estat[ií]sticas)\??$/i.test(lower) || lower.includes('mensagens o bot respondeu')) {
        return { intent: 'GET_STATS' };
    }
    if (lower.includes('apaga toda a memória') || lower.includes('apagar toda a memoria') || lower.includes('apaga a memória') || lower.includes('apagar a memoria') || lower.includes('limpar memória') || lower.includes('limpar memoria')) {
        return { intent: 'CLEAR_MEMORY' };
    }
    if (lower.includes('apaga toda a base de conhecimento') || lower.includes('apagar toda a base de conhecimento') || lower.includes('apaga a base') || lower.includes('limpar base')) {
        return { intent: 'CLEAR_KNOWLEDGE' };
    }

    const welcomeMatch = clean.match(/^(?:muda|mudar|altera|alterar)\s+(?:a\s+)?mensagem\s+de\s+boas[- ]vindas\s+para:?\s*(.+)$/i);
    if (welcomeMatch && welcomeMatch[1]) {
        return { intent: 'UPDATE_WELCOME_MESSAGE', value: welcomeMatch[1].trim() };
    }

    // 2. Fallback to Gemini NLU if keys are provided and text is conversational
    if (geminiKey && clean.length > 5 && !clean.startsWith('/')) {
        try {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const prompt = `Analise a mensagem em português e extraia a intenção administrativa se for um comando de configuração do bot de WhatsApp.
Retorne EXCLUSIVAMENTE um JSON no seguinte formato:
{"intent": "NOME_DA_INTENCAO", "value": "valor ou booleano"}

Intenções permitidas:
- "UPDATE_MEMORY" (value: true ou false)
- "UPDATE_GROUPS" (value: true ou false)
- "UPDATE_PRIVATE" (value: true ou false)
- "UPDATE_WELCOME_MESSAGE" (value: string com o texto da mensagem)
- "GET_STATUS"
- "GET_STATS"
- "CLEAR_MEMORY"
- "CLEAR_KNOWLEDGE"

Se não corresponder a nenhuma intenção administrativa acima, retorne:
{"intent": "UNKNOWN"}

Mensagem a analisar: "${clean}"`;

            const resp = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: 'application/json' }
            });

            const textResp = resp.text?.trim() || '{}';
            const parsed = JSON.parse(textResp);
            if (parsed && parsed.intent && parsed.intent !== 'UNKNOWN') {
                return parsed;
            }
        } catch {
            // Silently fall back if Gemini parsing fails
        }
    }

    return null;
}

export async function handleGroupSpecificCommand(opts: {
    sock: any;
    botId: string;
    currentBot: any;
    groupId: string;
    senderJid: string;
    senderNumber: string;
    isOwner: boolean;
    cleanText: string;
    lower: string;
    messageObj?: any;
    firestoreDb: Firestore;
}): Promise<{ handled: boolean }> {
    const { sock, botId, currentBot, groupId, senderJid, senderNumber, isOwner, cleanText, lower, messageObj, firestoreDb } = opts;

    const isGroupCmd = 
        lower === '/regras' || lower === '!regras' ||
        lower.startsWith('/definirregras') || lower.startsWith('!definirregras') ||
        lower === '/ajudagrupo' || lower === '!ajudagrupo' ||
        lower.startsWith('/moderacao') || lower.startsWith('!moderacao') ||
        lower.startsWith('/links') || lower.startsWith('!links') ||
        lower.startsWith('/palavras') || lower.startsWith('!palavras') ||
        lower.startsWith('/spam') || lower.startsWith('!spam') ||
        lower.startsWith('/motivacao') || lower.startsWith('!motivacao') ||
        lower.startsWith('/avisos') || lower.startsWith('!avisos') ||
        lower.startsWith('/limparavisos') || lower.startsWith('!limparavisos') ||
        lower.startsWith('/ban') || lower.startsWith('!ban');

    if (!isGroupCmd) return { handled: false };

    // 1. /regras is available to all group participants
    if (lower === '/regras' || lower === '!regras') {
        const config = await getGroupConfig(firestoreDb, botId, groupId);
        const rules = config.rulesText || 'Nenhuma regra configurada ainda para este grupo.';
        await sock.sendMessage(groupId, {
            text: `📜 *REGRAS DO GRUPO*\n\n${rules}`
        });
        return { handled: true };
    }

    // 2. All other commands require Group Admin OR Bot Owner
    const meta = await getGroupMeta(sock, groupId);
    const isGroupAdmin = meta?.admins.has(senderJid) || meta?.admins.has(senderNumber) || false;

    if (!isOwner && !isGroupAdmin) {
        await sock.sendMessage(groupId, {
            text: `⛔ *Acesso Negado*\nApenas administradores do grupo ou o proprietário do bot podem executar comandos de moderação neste grupo.`
        });
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'USER',
            action: 'UNAUTHORIZED_GROUP_ADMIN_ATTEMPT',
            command: cleanText,
            result: 'DENIED',
            details: `Tentativa não autorizada no grupo ${groupId}`
        });
        return { handled: true };
    }

    const groupRef = doc(firestoreDb, 'bots', botId, 'groups', groupId);
    const config = await getGroupConfig(firestoreDb, botId, groupId, meta?.subject);

    // /ajudagrupo
    if (lower === '/ajudagrupo' || lower === '!ajudagrupo') {
        const helpText = `🛡️ *TECHSTAR | GESTÃO INTELIGENTE DE GRUPOS*

• */regras* — Exibe as regras do grupo
• */definirregras <texto>* — Define novas regras do grupo
• */moderacao on|off* — Ativa ou desativa moderação geral
• */links on|off|delete|warn|remove* — Filtro de links
• */palavras list* — Lista palavras proibidas
• */palavras add <termo>* — Adiciona palavra proibida
• */palavras remove <termo>* — Remove palavra proibida
• */spam on|off* — Proteção anti-flood
• */motivacao on|off* — Mensagem diária automática
• */motivacao hora HH:MM* — Define horário da motivação
• */avisos [@membro]* — Consulta advertências
• */limparavisos [@membro]* — Zera advertências
• */ban @membro* — Remove membro do grupo (Requer Bot Admin)

_Nota: Administradores e o proprietário possuem imunidade automática._`;
        await sock.sendMessage(groupId, { text: helpText });
        return { handled: true };
    }

    // /moderacao on|off
    if (lower === '/moderacao on' || lower === '!moderacao on') {
        await updateDoc(groupRef, {
            antiLinkEnabled: true,
            antiBadWordsEnabled: true,
            antiSpamEnabled: true
        });
        await sock.sendMessage(groupId, { text: `🛡️ *Moderação Ativada!*\nFiltro de links, palavras proibidas e anti-spam foram habilitados.` });
        await recordGroupLog(firestoreDb, {
            botId,
            groupId,
            groupName: config.groupName,
            action: 'MODERATION_ENABLED',
            actor: senderNumber,
            details: 'Moderação geral ativada via comando WhatsApp'
        });
        return { handled: true };
    }

    if (lower === '/moderacao off' || lower === '!moderacao off') {
        await updateDoc(groupRef, {
            antiLinkEnabled: false,
            antiBadWordsEnabled: false,
            antiSpamEnabled: false
        });
        await sock.sendMessage(groupId, { text: `⚠️ *Moderação Desativada!*\nFiltro de links, palavras proibidas e anti-spam foram desabilitados.` });
        await recordGroupLog(firestoreDb, {
            botId,
            groupId,
            groupName: config.groupName,
            action: 'MODERATION_DISABLED',
            actor: senderNumber,
            details: 'Moderação geral desativada via comando WhatsApp'
        });
        return { handled: true };
    }

    // /links
    if (lower.startsWith('/links') || lower.startsWith('!links')) {
        const parts = cleanText.split(/\s+/);
        const sub = parts[1]?.toLowerCase();

        if (sub === 'on') {
            await updateDoc(groupRef, { antiLinkEnabled: true });
            await sock.sendMessage(groupId, { text: `🔗 *Filtro Anti-Link:* ATIVADO 🟢` });
        } else if (sub === 'off') {
            await updateDoc(groupRef, { antiLinkEnabled: false });
            await sock.sendMessage(groupId, { text: `🔗 *Filtro Anti-Link:* DESATIVADO 🔴` });
        } else if (sub === 'delete') {
            await updateDoc(groupRef, { antiLinkAction: 'delete' });
            await sock.sendMessage(groupId, { text: `🔗 *Ação Anti-Link:* Apenas Apagar Mensagem.` });
        } else if (sub === 'warn') {
            await updateDoc(groupRef, { antiLinkAction: 'delete_and_warn' });
            await sock.sendMessage(groupId, { text: `🔗 *Ação Anti-Link:* Apagar Mensagem e Advertir Membro.` });
        } else if (sub === 'remove') {
            await updateDoc(groupRef, { antiLinkAction: 'remove' });
            await sock.sendMessage(groupId, { text: `🔗 *Ação Anti-Link:* Expulsão Direta do Membro.` });
        } else {
            const allowed = config.allowedLinks?.join(', ') || 'Nenhum';
            await sock.sendMessage(groupId, {
                text: `🔗 *STATUS ANTI-LINK*\n\n• Estado: ${config.antiLinkEnabled ? '🟢 Ativo' : '🔴 Desativado'}\n• Ação: ${config.antiLinkAction}\n• Links Permitidos: ${allowed}\n\nUso: */links on | off | delete | warn | remove*`
            });
        }
        return { handled: true };
    }

    // /palavras
    if (lower.startsWith('/palavras') || lower.startsWith('!palavras')) {
        const parts = cleanText.split(/\s+/);
        const sub = parts[1]?.toLowerCase();
        const word = parts.slice(2).join(' ').trim();

        if (sub === 'add' && word) {
            const current = config.badWords || [];
            if (!current.includes(word.toLowerCase())) {
                const updated = [...current, word.toLowerCase()];
                await updateDoc(groupRef, { badWords: updated });
                await sock.sendMessage(groupId, { text: `🚫 Palavra "*${word}*" adicionada à lista de termos proibidos.` });
            } else {
                await sock.sendMessage(groupId, { text: `ℹ️ A palavra "*${word}*" já está na lista.` });
            }
        } else if (sub === 'remove' && word) {
            const current = config.badWords || [];
            const updated = current.filter(w => w !== word.toLowerCase());
            await updateDoc(groupRef, { badWords: updated });
            await sock.sendMessage(groupId, { text: `✅ Palavra "*${word}*" removida da lista de termos proibidos.` });
        } else {
            const list = config.badWords?.length > 0 ? config.badWords.map(w => `• ${w}`).join('\n') : 'Nenhuma palavra cadastrada.';
            await sock.sendMessage(groupId, {
                text: `🚫 *PALAVRAS PROIBIDAS*\n\nEstado: ${config.antiBadWordsEnabled ? '🟢 Ativo' : '🔴 Desativado'}\n\n*Lista Atual:*\n${list}\n\nUso: */palavras add <termo>* ou */palavras remove <termo>*`
            });
        }
        return { handled: true };
    }

    // /spam
    if (lower.startsWith('/spam') || lower.startsWith('!spam')) {
        const parts = cleanText.split(/\s+/);
        const sub = parts[1]?.toLowerCase();
        if (sub === 'on') {
            await updateDoc(groupRef, { antiSpamEnabled: true });
            await sock.sendMessage(groupId, { text: `⚡ *Anti-Spam / Anti-Flood:* ATIVADO 🟢` });
        } else if (sub === 'off') {
            await updateDoc(groupRef, { antiSpamEnabled: false });
            await sock.sendMessage(groupId, { text: `⚡ *Anti-Spam / Anti-Flood:* DESATIVADO 🔴` });
        } else {
            await sock.sendMessage(groupId, {
                text: `⚡ *STATUS ANTI-SPAM*\n\n• Estado: ${config.antiSpamEnabled ? '🟢 Ativo' : '🔴 Desativado'}\n• Limite: Máx ${config.antiSpamMaxMessages} mensagens em ${config.antiSpamTimeWindowSeconds}s\n\nUso: */spam on | off*`
            });
        }
        return { handled: true };
    }

    // /motivacao
    if (lower.startsWith('/motivacao') || lower.startsWith('!motivacao')) {
        const parts = cleanText.split(/\s+/);
        const sub = parts[1]?.toLowerCase();
        const arg = parts[2];

        if (sub === 'on') {
            await updateDoc(groupRef, { dailyMotivationEnabled: true });
            config.dailyMotivationEnabled = true;
            scheduleGroupMotivation({
                botId,
                groupConfig: config,
                getActiveSock: () => sock,
                firestoreDb,
                geminiKeys: currentBot.geminiKeys
            });
            await sock.sendMessage(groupId, { text: `🌅 *Mensagem Diária Motivacional:* ATIVADA 🟢\nHorário configurado: *${config.dailyMotivationTime}* [${config.dailyMotivationTimezone}]` });
        } else if (sub === 'off') {
            await updateDoc(groupRef, { dailyMotivationEnabled: false });
            config.dailyMotivationEnabled = false;
            scheduleGroupMotivation({
                botId,
                groupConfig: config,
                getActiveSock: () => sock,
                firestoreDb,
                geminiKeys: currentBot.geminiKeys
            });
            await sock.sendMessage(groupId, { text: `🌅 *Mensagem Diária Motivacional:* DESATIVADA 🔴` });
        } else if (sub === 'hora' && arg && /^\d{1,2}:\d{2}$/.test(arg)) {
            const formattedTime = arg.length === 4 ? `0${arg}` : arg;
            await updateDoc(groupRef, { dailyMotivationTime: formattedTime });
            config.dailyMotivationTime = formattedTime;
            scheduleGroupMotivation({
                botId,
                groupConfig: config,
                getActiveSock: () => sock,
                firestoreDb,
                geminiKeys: currentBot.geminiKeys
            });
            await sock.sendMessage(groupId, { text: `⏰ Horário da mensagem diária alterado para *${formattedTime}* [${config.dailyMotivationTimezone}].` });
        } else {
            await sock.sendMessage(groupId, {
                text: `🌅 *MOTIVAÇÃO DIÁRIA*\n\n• Estado: ${config.dailyMotivationEnabled ? '🟢 Ativo' : '🔴 Desativado'}\n• Horário: ${config.dailyMotivationTime}\n• Fuso: ${config.dailyMotivationTimezone}\n• Tópico: ${config.dailyMotivationTopic || 'Foco e Sucesso'}\n\nUso: */motivacao on | off* ou */motivacao hora 08:00*`
            });
        }
        return { handled: true };
    }

    // /definirregras
    if (lower.startsWith('/definirregras') || lower.startsWith('!definirregras')) {
        const newRules = cleanText.replace(/^\/?!?definirregras\s*/i, '').trim();
        if (!newRules) {
            await sock.sendMessage(groupId, { text: `⚠️ Forneça o texto das regras. Exemplo:\n*/definirregras 1. Respeito mútuo\\n2. Proibido links*` });
            return { handled: true };
        }
        await updateDoc(groupRef, { rulesText: newRules });
        await sock.sendMessage(groupId, { text: `✅ *Regras do grupo atualizadas com sucesso!*\n\n${newRules}` });
        return { handled: true };
    }

    // /avisos
    if (lower.startsWith('/avisos') || lower.startsWith('!avisos')) {
        const contextInfo = messageObj?.extendedTextMessage?.contextInfo;
        const mentionedJid = contextInfo?.mentionedJid?.[0];

        if (mentionedJid) {
            const targetPhone = normalizePhone(mentionedJid);
            const wDoc = await getDoc(doc(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings', targetPhone));
            if (wDoc.exists()) {
                const wData = wDoc.data();
                const reasons = (wData.reasons || []).map((r: string, i: number) => `${i + 1}. ${r}`).join('\n');
                await sock.sendMessage(groupId, {
                    text: `📋 *Advertências de @${targetPhone}*\nTotal: *${wData.count}/${config.maxWarnings}*\n\n*Motivos:*\n${reasons || 'Sem detalhes'}`,
                    mentions: [mentionedJid]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: `✅ O membro @${targetPhone} possui zero advertências registradas.`,
                    mentions: [mentionedJid]
                });
            }
        } else {
            const wSnap = await getDocs(collection(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings'));
            const activeWarned = wSnap.docs.filter(d => (d.data().count || 0) > 0);
            await sock.sendMessage(groupId, {
                text: `📋 *RESUMO DE ADVERTÊNCIAS DO GRUPO*\n\n• Membros com avisos ativos: ${activeWarned.length}\n• Limite para remoção: *${config.maxWarnings} avisos*\n\nPara consultar um membro: */avisos @membro*`
            });
        }
        return { handled: true };
    }

    // /limparavisos
    if (lower.startsWith('/limparavisos') || lower.startsWith('!limparavisos')) {
        const contextInfo = messageObj?.extendedTextMessage?.contextInfo;
        const mentionedJid = contextInfo?.mentionedJid?.[0];

        if (mentionedJid) {
            const targetPhone = normalizePhone(mentionedJid);
            await setDoc(doc(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings', targetPhone), {
                count: 0,
                reasons: [],
                lastWarningAt: new Date().toISOString()
            }, { merge: true });

            await sock.sendMessage(groupId, {
                text: `✅ As advertências de @${targetPhone} foram zeradas.`,
                mentions: [mentionedJid]
            });
        } else {
            const wSnap = await getDocs(collection(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings'));
            const batch = writeBatch(firestoreDb);
            wSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            await sock.sendMessage(groupId, { text: `✅ Todas as advertências dos membros deste grupo foram zeradas.` });
        }
        return { handled: true };
    }

    // /ban
    if (lower.startsWith('/ban') || lower.startsWith('!ban')) {
        const contextInfo = messageObj?.extendedTextMessage?.contextInfo;
        const targetJid = contextInfo?.mentionedJid?.[0];

        if (!targetJid) {
            await sock.sendMessage(groupId, { text: `⚠️ Mencione o membro que deseja remover. Exemplo: */ban @membro*` });
            return { handled: true };
        }

        const targetPhone = normalizePhone(targetJid);
        const botPhone = sock.user?.id ? normalizePhone(sock.user.id) : '';
        const ownerPhone = normalizePhone(currentBot.ownerPhone || currentBot.ownerNumber);

        const isTargetAdmin = meta?.admins.has(targetJid) || meta?.admins.has(targetPhone);
        const isTargetOwner = isPhoneMatch(targetPhone, ownerPhone);
        const isTargetBot = isPhoneMatch(targetPhone, botPhone);

        if (isTargetAdmin || isTargetOwner || isTargetBot) {
            await sock.sendMessage(groupId, {
                text: `⛔ *Ação Bloqueada*: Administradores, o proprietário e o próprio bot não podem ser removidos.`,
                mentions: [targetJid]
            });
            return { handled: true };
        }

        if (!meta?.botIsAdmin) {
            await sock.sendMessage(groupId, {
                text: `⚠️ O bot precisa ser promovido a *Administrador do Grupo* para remover participantes.`
            });
            return { handled: true };
        }

        try {
            await sock.groupParticipantsUpdate(groupId, [targetJid], 'remove');
            await sock.sendMessage(groupId, {
                text: `🚨 O membro @${targetPhone} foi removido do grupo por um administrador.`,
                mentions: [targetJid]
            });
            await recordGroupLog(firestoreDb, {
                botId,
                groupId,
                groupName: config.groupName,
                action: 'MEMBER_BANNED_MANUAL',
                actor: senderNumber,
                targetUser: targetPhone,
                details: `Remoção manual executada por ${senderNumber}`
            });
        } catch (err: any) {
            await sock.sendMessage(groupId, { text: `❌ Erro ao remover membro: ${err.message || 'Falha no WhatsApp'}` });
        }
        return { handled: true };
    }

    return { handled: false };
}

export async function handleWhatsAppAdminMessage(opts: {
    sock: any;
    botId: string;
    currentBot: any;
    senderJid: string;
    groupId?: string;
    destinationJid?: string;
    senderPn?: string;
    text: string;
    messageObj?: any;
    firestoreDb: Firestore;
    isGroup: boolean;
    onResetBot?: (botId: string) => Promise<void>;
    sendBotMessage?: (sendOpts: any) => Promise<boolean>;
}): Promise<{ handled: boolean }> {
    const { sock, botId, currentBot, senderJid, groupId, text, messageObj, firestoreDb, isGroup, onResetBot, sendBotMessage } = opts;
    const cleanText = (text || '').trim();
    if (!cleanText) return { handled: false };

    // Resolve safe reply destination: for groups, ALWAYS reply to groupId (@g.us), NEVER to participant LID!
    const replyDestination = (isGroup && groupId) ? groupId : (opts.destinationJid || senderJid);
    const sendReply = async (content: any, options?: any) => {
        if (sendBotMessage) {
            return sendBotMessage({
                botId,
                destinationJid: replyDestination,
                content,
                options,
                context: {
                    actionName: 'ADMIN_REPLY',
                    chatType: isGroup ? 'GROUP' : 'PRIVATE',
                    actorId: senderNumber
                }
            });
        }
        return sock.sendMessage(replyDestination, content, options);
    };

    // 1. IDENTIFICAÇÃO DO REMETENTE
    const senderPhoneRaw = opts.senderPn || senderJid;
    const senderNumber = normalizePhone(senderPhoneRaw);
    const ownerNumber = normalizePhone(currentBot.ownerPhone || currentBot.ownerNumber);
    const isOwner = isPhoneMatch(senderNumber, ownerNumber);
    const sessionKey = getSessionKey(botId, senderJid);
    const hasPending = pendingConfirmations.has(sessionKey);
    const isOwnerModeActive = ownerModeSessions.get(sessionKey) === true;
    const lower = cleanText.toLowerCase();

    // Check for Group Commands when in a group
    if (isGroup && groupId) {
        const handledGroupCmd = await handleGroupSpecificCommand({
            sock,
            botId,
            currentBot,
            groupId,
            senderJid,
            senderNumber,
            isOwner,
            cleanText,
            lower,
            messageObj,
            firestoreDb
        });
        if (handledGroupCmd.handled) {
            return { handled: true };
        }
    }

    // Check if message is an explicit slash command
    const isSlashCommand = cleanText.startsWith('/') || cleanText.startsWith('!');

    // Check for obvious admin intent keywords
    const isIntentKeyword = 
        lower.startsWith('ativa ') || lower.startsWith('ativar ') ||
        lower.startsWith('desativa ') || lower.startsWith('desativar ') ||
        lower.includes('estado do bot') || lower.includes('status do bot') ||
        lower.includes('estatísticas') || lower.includes('estatisticas') ||
        lower.includes('quantas mensagens') ||
        lower.startsWith('muda a mensagem') || lower.startsWith('mudar a mensagem') ||
        lower.startsWith('altera a mensagem') || lower.startsWith('alterar a mensagem') ||
        lower.includes('apaga toda a base') || lower.includes('apagar toda a base') ||
        lower.includes('apaga a base') || lower.includes('apagar a base') ||
        lower.includes('apaga todo o histórico') || lower.includes('apagar todo o historico') ||
        lower.includes('apaga a memória') || lower.includes('apagar a memoria') ||
        lower.includes('limpar memória') || lower.includes('limpar memoria') ||
        lower.includes('proprietário') || lower.includes('proprietario') ||
        lower.includes('dono do bot');

    // 2. PROTEÇÃO CONTRA PROMPT INJECTION E ACESSO NÃO AUTORIZADO
    // O backend autoriza estritamente pelo número de telefone, NUNCA pela IA ou pelo texto da mensagem!
    if (!isOwner) {
        // Em grupos, apenas comandos explícitos iniciados com / ou ! devem disparar recusa administrativa
        // para evitar falsos positivos quando membros conversam normalmente
        const shouldCheckUnauthorized = isGroup ? isSlashCommand : (isSlashCommand || isIntentKeyword);

        if (shouldCheckUnauthorized) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'USER',
                action: 'UNAUTHORIZED_ADMIN_ATTEMPT',
                command: cleanText,
                result: 'DENIED',
                chatId: replyDestination,
                destinationJid: replyDestination,
                chatType: isGroup ? 'GROUP' : 'PRIVATE',
                details: `Tentativa de comando administrativo por número não autorizado: ${senderNumber}`
            });

            await sendReply({
                text: `⛔ *Acesso Negado*\nApenas o proprietário autorizado pode executar comandos de gerenciamento neste bot.`
            });
            return { handled: true };
        }
        // Conversa normal de usuário: prosseguir para o atendimento padrão
        return { handled: false };
    }

    // Se é o proprietário, mas não é comando, nem está em owner mode, nem tem ação pendente, nem parece admin:
    if (!isSlashCommand && !isOwnerModeActive && !hasPending && !isIntentKeyword) {
        return { handled: false };
    }

    const botRef = doc(firestoreDb, 'bots', botId);

    // 3. FLUXO DE CONFIRMAÇÃO DE AÇÕES CRÍTICAS (CONFIRMAR / CANCELAR / TIMEOUT)
    if (hasPending) {
        const pending = pendingConfirmations.get(sessionKey)!;
        const now = Date.now();

        if (now > pending.expiresAt) {
            pendingConfirmations.delete(sessionKey);
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: `${pending.action}_TIMEOUT`,
                command: cleanText,
                result: 'DENIED',
                details: 'Ação crítica expirou por timeout (2 minutos)'
            });
            await sendReply( {
                text: `⏰ *Ação Expirada*\nO tempo limite de 2 minutos para confirmação expirou. A operação foi cancelada com segurança.`
            });
            return { handled: true };
        }

        const upper = cleanText.toUpperCase();
        if (upper === 'CONFIRMAR' || upper === 'SIM') {
            pendingConfirmations.delete(sessionKey);

            try {
                if (pending.action === 'CLEAR_HISTORY') {
                    const historySnap = await getDocs(collection(botRef, 'history'));
                    const batch = writeBatch(firestoreDb);
                    historySnap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();

                    await recordAuditLog(firestoreDb, {
                        botId,
                        actorId: senderNumber,
                        actorPhone: senderNumber,
                        actorRole: 'OWNER',
                        action: 'CLEAR_HISTORY',
                        command: 'CONFIRMAR',
                        result: 'SUCCESS',
                        details: `${historySnap.docs.length} mensagens apagadas da memória`
                    });

                    await sendReply( {
                        text: `✅ *Memória Limpa*\nToda a memória e histórico de conversas deste bot foram apagados com sucesso (${historySnap.docs.length} registros).`
                    });
                    return { handled: true };
                }

                if (pending.action === 'CLEAR_KNOWLEDGE') {
                    await updateDoc(botRef, { knowledgeBase: '' });

                    await recordAuditLog(firestoreDb, {
                        botId,
                        actorId: senderNumber,
                        actorPhone: senderNumber,
                        actorRole: 'OWNER',
                        action: 'CLEAR_KNOWLEDGE',
                        command: 'CONFIRMAR',
                        result: 'SUCCESS',
                        details: 'Toda a base de conhecimento foi limpa'
                    });

                    await sendReply( {
                        text: `✅ *Base de Conhecimento Apagada*\nToda a base de conhecimento do bot foi limpa com sucesso.`
                    });
                    return { handled: true };
                }

                if (pending.action === 'UPDATE_WELCOME_MSG') {
                    const newWelcome = pending.payload?.newWelcome || '';
                    await updateDoc(botRef, { welcomeMsg: newWelcome });

                    await recordAuditLog(firestoreDb, {
                        botId,
                        actorId: senderNumber,
                        actorPhone: senderNumber,
                        actorRole: 'OWNER',
                        action: 'UPDATE_WELCOME_MESSAGE',
                        command: 'CONFIRMAR',
                        result: 'SUCCESS',
                        details: `Nova mensagem de boas-vindas aplicada: ${newWelcome}`
                    });

                    await sendReply( {
                        text: `✅ *Mensagem de boas-vindas atualizada com sucesso!*\n\n"${newWelcome}"`
                    });
                    return { handled: true };
                }

                if (pending.action === 'RESET_SESSION') {
                    await recordAuditLog(firestoreDb, {
                        botId,
                        actorId: senderNumber,
                        actorPhone: senderNumber,
                        actorRole: 'OWNER',
                        action: 'RESET_SESSION',
                        command: 'CONFIRMAR',
                        result: 'SUCCESS',
                        details: 'Sessão Baileys reiniciada pelo proprietário'
                    });

                    await sendReply( {
                        text: `🔄 *Reiniciando Sessão WhatsApp...*\nAguarde alguns instantes enquanto a sessão é redefinida e um novo QR Code é preparado.`
                    });

                    if (onResetBot) {
                        await onResetBot(botId);
                    }
                    return { handled: true };
                }
            } catch (err: any) {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderNumber,
                    actorPhone: senderNumber,
                    actorRole: 'OWNER',
                    action: pending.action,
                    command: 'CONFIRMAR',
                    result: 'ERROR',
                    details: err.message
                });
                await sendReply( {
                    text: `❌ *Erro ao executar ação:*\n${err.message}`
                });
                return { handled: true };
            }
        } else if (upper === 'CANCELAR' || upper === 'NÃO' || upper === 'NAO') {
            pendingConfirmations.delete(sessionKey);
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: `${pending.action}_CANCELLED`,
                command: cleanText,
                result: 'SUCCESS',
                details: 'Operação cancelada pelo proprietário'
            });

            await sendReply( {
                text: `❌ *Ação Cancelada*\nNenhuma alteração foi realizada.`
            });
            return { handled: true };
        } else {
            await sendReply( {
                text: `⚠️ *Confirmação Pendente*\n\nVocê tem uma ação crítica aguardando resposta: *${pending.description}*.\n\nResponda:\n*CONFIRMAR* — para prosseguir\n*CANCELAR* — para abortar`
            });
            return { handled: true };
        }
    }

    // Helper: Registrar ação crítica
    const triggerCritical = async (action: PendingConfirmation['action'], description: string, payload?: any) => {
        pendingConfirmations.set(sessionKey, {
            action,
            description,
            payload,
            expiresAt: Date.now() + 120000 // 2 minutos
        });

        if (action === 'UPDATE_WELCOME_MSG') {
            await sendReply( {
                text: `📝 *Nova mensagem:*\n\n${payload.newWelcome}\n\nDeseja aplicar?\n\n*SIM* / *NÃO*`
            });
        } else {
            await sendReply( {
                text: `⚠️ *AÇÃO CRÍTICA*\n\nIsso apagará ${description.toLowerCase()} deste bot.\n\nResponda:\n\n*CONFIRMAR*\n\npara continuar.\n(Ou *CANCELAR* para abortar)`
            });
        }
    };

    const cmd = cleanText.toLowerCase();

    // 4. OWNER MODE (/owner e /sair)
    if (cmd === '/owner' || cmd === '!owner') {
        ownerModeSessions.set(sessionKey, true);
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'OWNER_MODE_ENTER',
            command: cleanText,
            result: 'SUCCESS'
        });

        await sendReply( {
            text: `👑 *MODO PROPRIETÁRIO*\n\nVocê está administrando:\n*${currentBot.name}*\n\nDigite */ajuda* para consultar os comandos disponíveis.`
        });
        return { handled: true };
    }

    if (cmd === '/sair' || cmd === '!sair') {
        ownerModeSessions.delete(sessionKey);
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'OWNER_MODE_EXIT',
            command: cleanText,
            result: 'SUCCESS'
        });

        await sendReply( {
            text: `👋 *Modo Proprietário Encerrado*\nO bot voltou ao modo normal de atendimento.`
        });
        return { handled: true };
    }

    // 5. MENU ADMINISTRATIVO (/menu, /ajuda)
    if (cmd === '/menu' || cmd === '/ajuda' || cmd === '!menu' || cmd === '!ajuda') {
        const canConfig = hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE);
        const canMemory = hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE);
        const canGroups = hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE);
        const canKnowledge = hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE);

        let menuText = `👑 *PAINEL DO PROPRIETÁRIO*\n\n/status — Estado do bot\n`;
        if (canConfig) menuText += `/config — Configurações\n`;
        if (canMemory) menuText += `/memoria — Memória\n`;
        if (canGroups) menuText += `/grupos — Grupos\n`;
        if (canConfig) menuText += `/privado — Conversas privadas\n`;
        if (canKnowledge) menuText += `/conhecimento — Base de conhecimento\n`;
        menuText += `/ia — Configurações de IA\n/estatisticas — Métricas de uso\n/logs — Atividade\n/sair — Sair do modo proprietário`;

        await sendReply( { text: menuText });
        return { handled: true };
    }

    // 6. STATUS DO BOT (/status, /info)
    if (cmd === '/status' || cmd === '/info' || cmd === '!status' || cmd === '!info') {
        const historySnap = await getDocs(collection(botRef, 'history'));
        const kbLength = (currentBot.knowledgeBase || '').length;

        const statusMsg = `🤖 *STATUS DO BOT*

• *Nome:* ${currentBot.name}
• *WhatsApp:* 🟢 Conectado
• *IA:* Gemini (ATIVO)
• *Memória:* ${currentBot.memoryEnabled ? '🟢 Ativa' : '🔴 Desativada'}
• *Grupos:* ${currentBot.respondInGroups ? '🟢 Ativos' : '🔴 Desativados'}
• *Privado:* ${currentBot.respondInPrivate ? '🟢 Ativo' : '🔴 Desativado'}
• *Base de Conhecimento:* ${kbLength > 0 ? `${kbLength} caracteres` : 'Vazia'}
• *Número de mensagens:* ${historySnap.docs.length}
• *Estado da conexão:* 🟢 Ativo`;

        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'GET_STATUS',
            command: cleanText,
            result: 'SUCCESS'
        });

        await sendReply( { text: statusMsg });
        return { handled: true };
    }

    // 7. CONTROLE DA MEMÓRIA
    if (cmd === '/memoria on') {
        if (!hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: 'PERMISSION_DENIED',
                command: cleanText,
                result: 'DENIED',
                details: 'Falta permissão MEMORY_MANAGE'
            });
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await updateDoc(botRef, { memoryEnabled: 1 });
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'MEMORY_ENABLE',
            command: cleanText,
            result: 'SUCCESS'
        });
        await sendReply( { text: `🧠 Memória de contexto ativada.` });
        return { handled: true };
    }

    if (cmd === '/memoria off') {
        if (!hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: 'PERMISSION_DENIED',
                command: cleanText,
                result: 'DENIED',
                details: 'Falta permissão MEMORY_MANAGE'
            });
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await updateDoc(botRef, { memoryEnabled: 0 });
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'MEMORY_DISABLE',
            command: cleanText,
            result: 'SUCCESS'
        });
        await sendReply( { text: `🧠 Memória de contexto desativada.` });
        return { handled: true };
    }

    if (cmd === '/memoria') {
        await sendReply( {
            text: `🧠 *MEMÓRIA DO BOT*\n\nEstado atual: ${currentBot.memoryEnabled ? '🟢 Ativada' : '🔴 Desativada'}\n\nComandos:\n• */memoria on* — Ativa memória de contexto\n• */memoria off* — Desativa memória\n• */limpar memoria* — Apaga todo o histórico (Ação Crítica)`
        });
        return { handled: true };
    }

    // 8. CONTROLE DE GRUPOS
    if (cmd === '/grupos on') {
        if (!hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: 'PERMISSION_DENIED',
                command: cleanText,
                result: 'DENIED',
                details: 'Falta permissão GROUP_MANAGE'
            });
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await updateDoc(botRef, { respondInGroups: 1 });
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'GROUPS_ENABLE',
            command: cleanText,
            result: 'SUCCESS'
        });
        await sendReply( { text: `👥 Respostas em grupos foram ativadas.` });
        return { handled: true };
    }

    if (cmd === '/grupos off') {
        if (!hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: 'PERMISSION_DENIED',
                command: cleanText,
                result: 'DENIED',
                details: 'Falta permissão GROUP_MANAGE'
            });
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await updateDoc(botRef, { respondInGroups: 0 });
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'GROUPS_DISABLE',
            command: cleanText,
            result: 'SUCCESS'
        });
        await sendReply( { text: `👥 Respostas em grupos foram desativadas.` });
        return { handled: true };
    }

    if (cmd.startsWith('/grupos admin')) {
        let adminGroups: any[] = [];
        try {
            if (sock) {
                const participating = await sock.groupFetchAllParticipating();
                for (const [gId, gMeta] of Object.entries(participating as Record<string, any>)) {
                    const participants = gMeta.participants || [];
                    const botIsAdmin = participants.some((p: any) => isBotParticipantAdmin(sock.user, p));
                    if (botIsAdmin) {
                        adminGroups.push({
                            id: gId,
                            subject: gMeta.subject || 'Grupo WhatsApp',
                            participantsCount: participants.length
                        });
                    }
                }
            } else {
                const savedSnap = await getDocs(collection(firestoreDb, 'bots', botId, 'groups'));
                savedSnap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.botIsAdmin) {
                        adminGroups.push({
                            id: docSnap.id,
                            subject: data.groupName || 'Grupo WhatsApp',
                            participantsCount: data.participantCount || 0
                        });
                    }
                });
            }
        } catch (err) {
            console.error('[WhatsAppController] Erro ao buscar grupos admin:', err);
        }

        if (adminGroups.length === 0) {
            await sendReply( {
                text: `👑 *GRUPOS ONDE SOU ADMIN*\n\nNenhum grupo encontrado onde este bot possui privilégios de Administrador.`
            });
            return { handled: true };
        }

        const parts = cleanText.split(/\s+/);
        const page = parseInt(parts[2] || '1', 10) || 1;
        const pageSize = 10;
        const totalPages = Math.ceil(adminGroups.length / pageSize);
        const currentPage = Math.min(Math.max(1, page), totalPages);
        const pagedGroups = adminGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

        let msg = `👑 *GRUPOS ONDE SOU ADMIN* (${currentPage}/${totalPages})\n\n`;
        pagedGroups.forEach((g, idx) => {
            const num = (currentPage - 1) * pageSize + idx + 1;
            msg += `${num}. *${g.subject}* (${g.participantsCount} membros)\n`;
        });

        msg += `\nTotal: *${adminGroups.length}* grupo(s) como administrador.`;
        if (totalPages > currentPage) {
            msg += `\n\n_Para ver mais, digite: */grupos admin ${currentPage + 1}*_`;
        }

        await sendReply( { text: msg });
        return { handled: true };
    }

    if (cmd === '/grupos') {
        let totalGroups = 0;
        let adminCount = 0;
        let memberCount = 0;

        try {
            if (sock) {
                const participating = await sock.groupFetchAllParticipating();
                for (const [gId, gMeta] of Object.entries(participating as Record<string, any>)) {
                    totalGroups++;
                    const participants = gMeta.participants || [];
                    const botIsAdmin = participants.some((p: any) => isBotParticipantAdmin(sock.user, p));
                    if (botIsAdmin) adminCount++;
                    else memberCount++;
                }
            } else {
                const savedSnap = await getDocs(collection(firestoreDb, 'bots', botId, 'groups'));
                savedSnap.docs.forEach(docSnap => {
                    totalGroups++;
                    if (docSnap.data().botIsAdmin) adminCount++;
                    else memberCount++;
                });
            }
        } catch (e) {}

        const summaryMsg = `📊 *RESUMO DE GRUPOS*

• Total de Grupos: *${totalGroups}*
• Sou Admin: *${adminCount}* 👑
• Sou Membro: *${memberCount}* 👤

• Respostas em grupos: ${currentBot.respondInGroups ? '🟢 Ativas' : '🔴 Desativadas'}

*Comandos:*
• */grupos admin* — Listar grupos onde sou admin
• */grupos on* — Ativar respostas em grupos
• */grupos off* — Desativar respostas em grupos`;

        await sendReply( { text: summaryMsg });
        return { handled: true };
    }

    // 9. CONTROLE DE PRIVADO
    if (cmd === '/privado on') {
        if (!hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE)) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: 'PERMISSION_DENIED',
                command: cleanText,
                result: 'DENIED',
                details: 'Falta permissão BOT_CONFIG_UPDATE'
            });
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await updateDoc(botRef, { respondInPrivate: 1 });
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'PRIVATE_ENABLE',
            command: cleanText,
            result: 'SUCCESS'
        });
        await sendReply( { text: `💬 Respostas no privado foram ativadas.` });
        return { handled: true };
    }

    if (cmd === '/privado off') {
        if (!hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE)) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: 'PERMISSION_DENIED',
                command: cleanText,
                result: 'DENIED',
                details: 'Falta permissão BOT_CONFIG_UPDATE'
            });
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await updateDoc(botRef, { respondInPrivate: 0 });
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'PRIVATE_DISABLE',
            command: cleanText,
            result: 'SUCCESS'
        });
        await sendReply( { text: `💬 Respostas no privado foram desativadas.` });
        return { handled: true };
    }

    if (cmd === '/privado') {
        await sendReply( {
            text: `💬 *CONVERSAS PRIVADAS*\n\nEstado atual: ${currentBot.respondInPrivate ? '🟢 Ativas' : '🔴 Desativadas'}\n\nComandos:\n• */privado on* — Ativa conversas privadas\n• */privado off* — Desativa conversas privadas`
        });
        return { handled: true };
    }

    // 10. GERENCIAMENTO DA BASE DE CONHECIMENTO
    if (cmd === '/conhecimento' || cmd === '!conhecimento') {
        const kbText = currentBot.knowledgeBase || '';
        const kbChars = kbText.length;
        await sendReply( {
            text: `📚 *BASE DE CONHECIMENTO*\n\n• Caracteres cadastrados: ${kbChars}\n• Estado: ${kbChars > 0 ? '🟢 Ativa e Indexada' : '⚪ Vazia'}\n\nPara consultar o conteúdo:\n*/conhecimento listar*\n\nPara apagar todo o conteúdo (Ação Crítica):\n*/conhecimento limpar*`
        });
        return { handled: true };
    }

    if (cmd === '/conhecimento listar' || cmd === '!conhecimento listar') {
        if (!hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE)) {
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        const kbText = currentBot.knowledgeBase || '';
        if (!kbText) {
            await sendReply( { text: `📚 A base de conhecimento deste bot está atualmente vazia.` });
            return { handled: true };
        }
        const preview = kbText.length > 500 ? kbText.substring(0, 500) + '...\n\n_(conteúdo truncado para visualização)_' : kbText;
        await sendReply( {
            text: `📚 *CONTEÚDO DA BASE DE CONHECIMENTO*\n\n${preview}`
        });
        return { handled: true };
    }

    if (cmd === '/conhecimento limpar' || cmd === '!conhecimento limpar' || cmd === '/limpar base') {
        if (!hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE)) {
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await triggerCritical('CLEAR_KNOWLEDGE', 'toda a base de conhecimento');
        return { handled: true };
    }

    // 11. GERENCIAMENTO DA IA
    if (cmd === '/ia' || cmd === '/ia status' || cmd === '!ia') {
        const hasKeys = !!(currentBot.geminiKeys && currentBot.geminiKeys.trim().length > 0);
        const keysCount = hasKeys ? currentBot.geminiKeys.split(',').length : 0;

        await sendReply( {
            text: `🧠 *CONFIGURAÇÕES DE IA*\n\n• *Modelo:* Gemini\n• *Estado:* ATIVO\n• *Chaves configuradas:* ${hasKeys ? `SIM (${keysCount} ativas)` : 'NÃO'}`
        });
        return { handled: true };
    }

    // 12. ESTATÍSTICAS
    if (cmd === '/estatisticas' || cmd === '/stats' || cmd === '!estatisticas') {
        const historySnap = await getDocs(collection(botRef, 'history'));
        const auditLogs = await fetchAuditLogs(firestoreDb, botId, 50);

        // Unique users served
        const users = new Set<string>();
        historySnap.docs.forEach(d => {
            const data = d.data();
            if (data.jid) users.add(data.jid);
        });

        const errorLogs = auditLogs.filter(l => l.result === 'DENIED' || l.result === 'ERROR');

        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderNumber,
            actorPhone: senderNumber,
            actorRole: 'OWNER',
            action: 'GET_STATS',
            command: cleanText,
            result: 'SUCCESS'
        });

        await sendReply( {
            text: `📊 *ESTATÍSTICAS DO BOT*

• *Mensagens hoje:* ${historySnap.docs.length}
• *Respostas hoje:* ${historySnap.docs.filter(d => d.data().role === 'model').length}
• *Usuários atendidos:* ${users.size}
• *Erros/Tentativas bloqueadas:* ${errorLogs.length}
• *Ações administrativas registradas:* ${auditLogs.length}`
        });
        return { handled: true };
    }

    // 13. LOGS DE ATIVIDADE
    if (cmd === '/logs' || cmd === '!logs') {
        const logs = await fetchAuditLogs(firestoreDb, botId, 6);
        if (logs.length === 0) {
            await sendReply( { text: `📋 Nenhum log registrado recentemente.` });
            return { handled: true };
        }

        let msg = `📋 *ÚLTIMA ATIVIDADE (AUDITORIA)*\n\n`;
        logs.forEach(l => {
            const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Recente';
            const icon = l.result === 'SUCCESS' ? '✅' : l.result === 'DENIED' ? '⛔' : '❌';
            msg += `${icon} *${l.action}* (${l.role || 'SISTEMA'})\nHorário: ${timeStr} | Resultado: ${l.result}\n\n`;
        });

        await sendReply( { text: msg.trim() });
        return { handled: true };
    }

    // 14. RESET DE SESSÃO
    if (cmd === '/resetar' || cmd === '/desconectar') {
        if (!hasPermission(currentBot, PERMISSIONS.WHATSAPP_MANAGE)) {
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await triggerCritical('RESET_SESSION', 'desconectar e reiniciar a sessão WhatsApp');
        return { handled: true };
    }

    // 15. LIMPAR MEMÓRIA EXPLICITAMENTE
    if (cmd === '/limpar memoria' || cmd === '/limpar historico') {
        if (!hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
            await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await triggerCritical('CLEAR_HISTORY', 'toda a memória');
        return { handled: true };
    }

    // 16. PROCESSAMENTO POR LINGUAGEM NATURAL (NLU E INTENT MAPPING)
    const firstGeminiKey = (currentBot.geminiKeys || '').split(',')[0]?.trim() || process.env.GEMINI_API_KEY;
    const parsedIntent = await parseOwnerIntent(cleanText, firstGeminiKey);

    if (parsedIntent) {
        if (parsedIntent.intent === 'UPDATE_MEMORY') {
            if (!hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
                await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            const val = parsedIntent.value ? 1 : 0;
            await updateDoc(botRef, { memoryEnabled: val });
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: val ? 'MEMORY_ENABLE' : 'MEMORY_DISABLE',
                command: cleanText,
                result: 'SUCCESS'
            });
            await sendReply( {
                text: val ? `🧠 Memória de contexto ativada.` : `🧠 Memória de contexto desativada.`
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'UPDATE_GROUPS') {
            if (!hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
                await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            const val = parsedIntent.value ? 1 : 0;
            await updateDoc(botRef, { respondInGroups: val });
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: val ? 'GROUPS_ENABLE' : 'GROUPS_DISABLE',
                command: cleanText,
                result: 'SUCCESS'
            });
            await sendReply( {
                text: val ? `👥 Respostas em grupos foram ativadas.` : `👥 Respostas em grupos foram desativadas.`
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'UPDATE_PRIVATE') {
            if (!hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE)) {
                await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            const val = parsedIntent.value ? 1 : 0;
            await updateDoc(botRef, { respondInPrivate: val });
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: val ? 'PRIVATE_ENABLE' : 'PRIVATE_DISABLE',
                command: cleanText,
                result: 'SUCCESS'
            });
            await sendReply( {
                text: val ? `💬 Respostas no privado foram ativadas.` : `💬 Respostas no privado foram desativadas.`
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'UPDATE_WELCOME_MESSAGE') {
            if (!hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE)) {
                await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            await triggerCritical('UPDATE_WELCOME_MSG', 'alterar mensagem de boas-vindas', {
                newWelcome: parsedIntent.value
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'GET_STATUS') {
            const historySnap = await getDocs(collection(botRef, 'history'));
            const kbLength = (currentBot.knowledgeBase || '').length;

            const statusMsg = `🤖 *STATUS DO BOT*

• *Nome:* ${currentBot.name}
• *WhatsApp:* 🟢 Conectado
• *IA:* Gemini (ATIVO)
• *Memória:* ${currentBot.memoryEnabled ? '🟢 Ativa' : '🔴 Desativada'}
• *Grupos:* ${currentBot.respondInGroups ? '🟢 Ativos' : '🔴 Desativados'}
• *Privado:* ${currentBot.respondInPrivate ? '🟢 Ativo' : '🔴 Desativado'}
• *Base de Conhecimento:* ${kbLength > 0 ? `${kbLength} caracteres` : 'Vazia'}
• *Número de mensagens:* ${historySnap.docs.length}
• *Estado da conexão:* 🟢 Ativo`;

            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'OWNER',
                action: 'GET_STATUS',
                command: cleanText,
                result: 'SUCCESS'
            });

            await sendReply( { text: statusMsg });
            return { handled: true };
        }

        if (parsedIntent.intent === 'GET_STATS') {
            const historySnap = await getDocs(collection(botRef, 'history'));
            const auditLogs = await fetchAuditLogs(firestoreDb, botId, 50);
            const users = new Set<string>();
            historySnap.docs.forEach(d => {
                const data = d.data();
                if (data.jid) users.add(data.jid);
            });
            const errorLogs = auditLogs.filter(l => l.result === 'DENIED' || l.result === 'ERROR');

            await sendReply( {
                text: `📊 *ESTATÍSTICAS DO BOT*

• *Mensagens hoje:* ${historySnap.docs.length}
• *Respostas hoje:* ${historySnap.docs.filter(d => d.data().role === 'model').length}
• *Usuários atendidos:* ${users.size}
• *Erros/Tentativas bloqueadas:* ${errorLogs.length}
• *Ações administrativas registradas:* ${auditLogs.length}`
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'CLEAR_MEMORY') {
            if (!hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
                await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            await triggerCritical('CLEAR_HISTORY', 'toda a memória');
            return { handled: true };
        }

        if (parsedIntent.intent === 'CLEAR_KNOWLEDGE') {
            if (!hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE)) {
                await sendReply( { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            await triggerCritical('CLEAR_KNOWLEDGE', 'toda a base de conhecimento');
            return { handled: true };
        }
    }

    // Se estiver em modo proprietário e digitou comando slash inválido
    if (isOwnerModeActive && isSlashCommand) {
        await sendReply( {
            text: `❓ *Comando não reconhecido.*\nDigite */ajuda* para consultar os comandos ou */sair* para voltar ao atendimento normal.`
        });
        return { handled: true };
    }

    // Se o proprietário estiver conversando normalmente, deixa passar para o chat com a IA
    return { handled: false };
}
