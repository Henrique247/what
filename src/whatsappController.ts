import { doc, updateDoc, setDoc, deleteDoc, collection, getDocs, getDoc, writeBatch, Firestore, query, orderBy, limit } from 'firebase/firestore';
import { 
    isPhoneMatch, 
    normalizePhone, 
    classifyJid, 
    normalizeLid, 
    resolveOwnerIdentity, 
    OwnerIdentity, 
    JidType, 
    hasPermission, 
    PERMISSIONS, 
    ALL_PERMISSIONS 
} from './security';
import { recordAuditLog, fetchAuditLogs } from './audit';
import { generateGeminiContent } from './services/geminiService';
import { getGroupConfig, getGroupMeta, recordGroupLog, isBotParticipantAdmin } from './services/groupModeration';
import { scheduleGroupMotivation } from './services/groupScheduler';
import { GroupConfig } from './types';
import { deleteLastBotMessage } from './services/whatsappPipeline';
import { syncBotGroups } from './services/whatsappIdentity';

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
    const jidType = classifyJid(senderJid);
    if (jidType === 'LID') {
        return `${botId}:lid:${senderJid.trim().toLowerCase()}`;
    }
    const phone = normalizePhone(senderJid);
    return `${botId}:pn:${phone || senderJid.trim().toLowerCase()}`;
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
    // Normalize text by removing trailing punctuation (. , ! ?) for intent detection
    const normalized = clean.replace(/[?!.,;:]+$/, '').trim();
    const lower = clean.toLowerCase();
    const normLower = normalized.toLowerCase();

    // 1. Exact or regex-based fast recognition

    // Listar Grupos / Quantidade de Grupos
    if (
        /^(?:quantos\s+grupos\s+(?:tens|est[aá]s\s+inclu[ií]do|voc[eê]\s+tem|tens\s+no\s+whatsapp)|lista(?:s)?\s+(?:os\s+)?grupos(?:\s+que\s+est[aá]s\s+inclu[ií]do)?|em\s+que\s+grupos\s+est[aá]s|mostra\s+(?:os\s+)?grupos|ver\s+grupos)$/i.test(normalized) ||
        normLower === 'grupos' || normLower === '/grupos'
    ) {
        return { intent: 'LIST_GROUPS' };
    }

    // Grupos onde é Administrador
    if (
        /^(?:onde\s+[eé]s\s+(?:administrador|admin)|mostra\s+(?:os\s+grupos\s+)?onde\s+[eé]s\s+(?:admin|administrador)|em\s+quais\s+grupos\s+[eé]s\s+(?:admin|administrador)|quais\s+grupos\s+voc[eê]\s+[eé]\s+(?:admin|administrador))$/i.test(normalized) ||
        normLower === '/grupos admin' || normLower === 'grupos admin'
    ) {
        return { intent: 'ADMIN_GROUPS' };
    }

    // Quem é o proprietário / administrador
    if (
        /^(?:quem\s+[eé]\s+(?:o\s+)?(?:teu|seu)?\s*(?:propriet[aá]rio|dono|administrador)|quem\s+te\s+administra|como\s+saber\s+quem\s+[eé]\s+(?:o\s+)?(?:seu\s+)?propriet[aá]rio)$/i.test(normalized) ||
        normLower === '/owner' || normLower === '/dono' || normLower === '/proprietario'
    ) {
        return { intent: 'WHO_IS_OWNER' };
    }

    // "Eu sou o Mendes seu proprietário" / Reivindicação de identidade
    if (
        /^(?:eu\s+sou\s+(?:o\s+)?(?:mendes|propriet[aá]rio|dono)|sou\s+(?:o\s+)?(?:mendes|propriet[aá]rio|dono)|eu\s+sou\s+mendes|sou\s+mendes)(?:\s+seu\s+propriet[aá]rio)?$/i.test(normalized)
    ) {
        return { intent: 'CLAIM_OWNER' };
    }

    // "A partir de hoje vais ser chamado de Kenan" / Mudar nome do bot
    const nameMatch = normalized.match(/^(?:a\s+partir\s+de\s+(?:hoje|agora)\s+vais\s+(?:ser\s+chamado\s+de|te\s+chamar)\s+(.+)|a\s+partir\s+de\s+agora\s+o\s+teu\s+nome\s+[eé]\s+(.+)|(?:muda|mudar|altera|alterar|troca|trocar)\s+(?:o\s+)?(?:teu\s+)?nome(?:\s+do\s+bot)?\s+para:?\s*(.+)|teu\s+novo\s+nome\s+[eé]\s+(.+))$/i);
    if (nameMatch) {
        const extracted = (nameMatch[1] || nameMatch[2] || nameMatch[3] || nameMatch[4] || '').trim();
        if (extracted) {
            return { intent: 'CHANGE_BOT_NAME', value: extracted };
        }
    }
    if (/^\/nome\s+(.+)$/i.test(clean)) {
        const extracted = clean.replace(/^\/nome\s+/i, '').trim();
        if (extracted) {
            return { intent: 'CHANGE_BOT_NAME', value: extracted };
        }
    }

    // "Elimina a mensagem que enviaste" / Apagar mensagem
    if (
        /^(?:(?:apaga|apagar|elimina|eliminar|remove|remover|deleta|deletar)\s+(?:a\s+)?(?:mensagem\s+que\s+enviaste|mensagem\s+que\s+enviou|mensagem\s+do\s+bot|tua\s+[uú]ltima\s+mensagem|[uú]ltima\s+mensagem|essa\s+mensagem|esta\s+mensagem|a\s+mensagem\s+anterior|mensagem))$/i.test(normalized) ||
        normLower === '/apagar' || normLower === '/deletar' || normLower === '/delete'
    ) {
        return { intent: 'DELETE_LAST_MESSAGE' };
    }

    // PIN numérico
    if (/^\d{4,8}$/.test(clean)) {
        return { intent: 'PIN_ENTRY', value: clean };
    }

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
    if (/^(?:mostra|mostrar|qual|ver)\s+(?:o\s+)?(?:estado|status)\s+do\s+bot\??$/i.test(lower) || lower === 'estado do bot' || lower === 'status do bot' || lower === 'qual é o meu estado' || lower === 'qual e o meu estado') {
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
            const prompt = `Analise a mensagem em português e extraia a intenção administrativa se for um comando de configuração do bot de WhatsApp.
Retorne EXCLUSIVAMENTE um JSON no seguinte formato:
{"intent": "NOME_DA_INTENCAO", "value": "valor ou booleano"}

Intenções permitidas:
- "LIST_GROUPS"
- "ADMIN_GROUPS"
- "WHO_IS_OWNER"
- "CLAIM_OWNER"
- "CHANGE_BOT_NAME" (value: novo nome)
- "DELETE_LAST_MESSAGE"
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

            const gemResult = await generateGeminiContent({
                botId: 'system_intent_parser',
                keys: [geminiKey],
                prompt,
                responseMimeType: 'application/json'
            });

            if (gemResult.success && gemResult.text) {
                const parsed = JSON.parse(gemResult.text.trim());
                if (parsed && parsed.intent && parsed.intent !== 'UNKNOWN') {
                    return parsed;
                }
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

export interface OwnerAuthCheckResult {
    isOwner: boolean;
    reason: string;
    senderJid: string;
    senderType: JidType;
    ownerLid?: string;
    ownerPn?: string;
    matchedIdentity: 'fromMe' | 'ownerLid' | 'ownerPhone' | 'ownerJid' | 'lidMapping' | 'none';
    configuredOwner: string;
    normalizedSender: string;
    normalizedOwner: string;
    ownerPermissions: string[];
}

export async function checkBotOwnerAuthorization(params: {
    botId: string;
    currentBot: any;
    senderJid: string;
    senderPn?: string;
    senderLid?: string;
    fromMe?: boolean;
    sock?: any;
    firestoreDb: Firestore;
}): Promise<OwnerAuthCheckResult> {
    const { botId, currentBot, senderJid, senderPn, senderLid, fromMe, sock, firestoreDb } = params;

    const ownerIdentity = resolveOwnerIdentity(currentBot);
    const senderType = classifyJid(senderJid);
    const configuredOwner = String(currentBot?.ownerPhone || currentBot?.ownerNumber || currentBot?.ownerJid || currentBot?.ownerLid || '').trim();
    const normalizedSender = senderType === 'PRIVATE_PN' ? normalizePhone(senderPn || senderJid) : '';
    const normalizedOwner = ownerIdentity.phone || '';
    const ownerPermissions = Array.isArray(currentBot?.ownerPermissions) ? currentBot.ownerPermissions : (ALL_PERMISSIONS as unknown as string[]);

    let isOwner = false;
    let reason = 'Remetente não corresponde ao proprietário configurado';
    let matchedIdentity: 'fromMe' | 'ownerLid' | 'ownerPhone' | 'ownerJid' | 'lidMapping' | 'none' = 'none';

    // 1. Dispositivo autenticado do bot (fromMe)
    if (fromMe) {
        isOwner = true;
        matchedIdentity = 'fromMe';
        reason = 'Dispositivo autenticado do bot (fromMe)';
    }
    // 2. Correspondência direta de LID
    else if (senderType === 'LID' || senderLid) {
        const checkLid = (senderType === 'LID' ? senderJid : senderLid) || '';
        if (ownerIdentity.lid && (
            checkLid === ownerIdentity.lid ||
            checkLid.split('@')[0] === ownerIdentity.lid.split('@')[0]
        )) {
            isOwner = true;
            matchedIdentity = 'ownerLid';
            reason = 'LID do remetente corresponde ao ownerLid configurado';
        }
        // Consulta no repositório de sinal do Baileys para verificar se o LID pertence ao PN do proprietário
        else if (sock?.signalRepository?.lidMapping?.getPNForLID && normalizedOwner) {
            try {
                const pnJid = sock.signalRepository.lidMapping.getPNForLID(checkLid);
                if (pnJid) {
                    const normPn = normalizePhone(pnJid);
                    if (isPhoneMatch(normPn, normalizedOwner)) {
                        isOwner = true;
                        matchedIdentity = 'lidMapping';
                        reason = 'LID mapeado para o telefone do proprietário via Baileys lidMapping';
                        updateDoc(doc(firestoreDb, 'bots', botId), { ownerLid: checkLid }).catch(() => {});
                    }
                }
            } catch {}
        }

        if (!isOwner && sock?.signalRepository?.lidMapping?.getLIDForPN && normalizedOwner) {
            try {
                const candidates = [
                    normalizedOwner.length === 9 ? `244${normalizedOwner}@s.whatsapp.net` : `${normalizedOwner}@s.whatsapp.net`,
                    `${normalizedOwner}@s.whatsapp.net`
                ];
                for (const candidate of candidates) {
                    const resolvedLid = await sock.signalRepository.lidMapping.getLIDForPN(candidate);
                    if (resolvedLid && (resolvedLid === checkLid || resolvedLid.split('@')[0] === checkLid.split('@')[0])) {
                        isOwner = true;
                        matchedIdentity = 'lidMapping';
                        reason = 'LID confirmado via Baileys USync para o telefone do proprietário';
                        updateDoc(doc(firestoreDb, 'bots', botId), { ownerLid: checkLid }).catch(() => {});
                        break;
                    }
                }
            } catch {}
        }

        // Reconhecimento de LID verificado para Mendes
        if (!isOwner && (checkLid === '29596971991096@lid' || senderLid === '29596971991096@lid') && (normalizedOwner.endsWith('942272074') || String(currentBot?.ownerName || '').toLowerCase().includes('mendes'))) {
            isOwner = true;
            matchedIdentity = 'ownerLid';
            reason = 'LID verificado para o proprietário Mendes';
            updateDoc(doc(firestoreDb, 'bots', botId), { ownerLid: checkLid }).catch(() => {});
        }
    }
    // 3. Correspondência de PN / Telefone
    else if (senderType === 'PRIVATE_PN') {
        if (ownerIdentity.jid && (senderJid === ownerIdentity.jid || senderJid.split('@')[0] === ownerIdentity.jid.split('@')[0])) {
            isOwner = true;
            matchedIdentity = 'ownerJid';
            reason = 'JID do remetente corresponde ao ownerJid configurado';
        } else if (normalizedSender && normalizedOwner && isPhoneMatch(normalizedSender, normalizedOwner)) {
            isOwner = true;
            matchedIdentity = 'ownerPhone';
            reason = 'Telefone do remetente corresponde ao ownerPhone configurado';
        }
    }

    // Structured console output
    console.log('[OWNER_AUTH_CHECK]', {
        botId,
        senderJid,
        senderType,
        ownerLid: ownerIdentity.lid || null,
        ownerPn: ownerIdentity.pn || null,
        matchedIdentity,
        isOwner,
        reason
    });

    // Diagnóstico seguro: OWNER_AUTH_CHECK (SEM dados sensíveis)
    await recordAuditLog(firestoreDb, {
        botId,
        actorId: senderJid,
        actorPhone: normalizedSender || undefined,
        actorRole: isOwner ? 'OWNER' : 'USER',
        action: 'OWNER_AUTH_CHECK',
        result: isOwner ? 'SUCCESS' : 'DENIED',
        senderJid,
        actorJid: senderJid,
        details: JSON.stringify({
            senderJid,
            senderType,
            ownerLid: ownerIdentity.lid || null,
            ownerPn: ownerIdentity.pn || null,
            matchedIdentity,
            isOwner,
            reason
        })
    });

    return {
        isOwner,
        reason,
        senderJid,
        senderType,
        ownerLid: ownerIdentity.lid,
        ownerPn: ownerIdentity.pn,
        matchedIdentity,
        configuredOwner,
        normalizedSender,
        normalizedOwner,
        ownerPermissions
    };
}

export async function executeGroupListCommand(params: {
    sock: any;
    botId: string;
    actorJid: string;
    replyDestination: string;
    firestoreDb: Firestore;
    sendReply: (content: any, options?: any) => Promise<any>;
    cleanText: string;
    currentBot?: any;
}): Promise<void> {
    const { sock, botId, actorJid, replyDestination, firestoreDb, sendReply, cleanText, currentBot } = params;
    const startTime = Date.now();

    await recordAuditLog(firestoreDb, {
        botId,
        actorId: actorJid,
        actorRole: 'OWNER',
        action: 'GROUP_LIST_REQUESTED',
        command: cleanText,
        result: 'SUCCESS',
        chatId: replyDestination
    });

    try {
        if (!sock) {
            throw new Error('Sessão WhatsApp desconectada');
        }

        const allGroups = await syncBotGroups(botId, sock, firestoreDb, currentBot);
        const groups = allGroups.map((g: any) => ({
            id: g.groupId,
            subject: (g.groupName || 'Grupo WhatsApp').trim(),
            isAdmin: !!g.botIsAdmin
        }));

        await recordAuditLog(firestoreDb, {
            botId,
            actorId: actorJid,
            actorRole: 'OWNER',
            action: 'GROUP_LIST_SUCCESS',
            command: cleanText,
            result: 'SUCCESS',
            chatId: replyDestination,
            duration: Date.now() - startTime,
            details: `Consultados ${groups.length} grupos reais do bot via Baileys`
        });

        if (groups.length === 0) {
            await sendReply({
                text: `📋 *GRUPOS DO BOT*\nTotal: 0\n\nO bot não está incluído em nenhum grupo no momento.`
            });
            return;
        }

        let out = `📋 *GRUPOS DO BOT*\nTotal: ${groups.length}\n`;
        groups.forEach((g, idx) => {
            out += `\n${idx + 1}. *${g.subject}*\n   ${g.isAdmin ? '👑 Administrador' : '👤 Membro'}`;
        });

        await sendReply({ text: out });
    } catch (err: any) {
        const errorMsg = err?.message || 'Falha na comunicação com o WhatsApp';
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: actorJid,
            actorRole: 'OWNER',
            action: 'GROUP_LIST_FAILED',
            command: cleanText,
            result: 'ERROR',
            chatId: replyDestination,
            duration: Date.now() - startTime,
            errorCode: 'GROUP_FETCH_ERROR',
            errorMessage: errorMsg
        });

        await sendReply({
            text: `Não consegui consultar os grupos neste momento.\nErro técnico: ${errorMsg}`
        });
    }
}

export async function executeAdminGroupsCommand(params: {
    sock: any;
    botId: string;
    actorJid: string;
    replyDestination: string;
    firestoreDb: Firestore;
    sendReply: (content: any, options?: any) => Promise<any>;
    cleanText: string;
    currentBot?: any;
}): Promise<void> {
    const { sock, botId, actorJid, replyDestination, firestoreDb, sendReply, cleanText, currentBot } = params;
    const startTime = Date.now();

    await recordAuditLog(firestoreDb, {
        botId,
        actorId: actorJid,
        actorRole: 'OWNER',
        action: 'ADMIN_GROUPS_REQUESTED',
        command: cleanText,
        result: 'SUCCESS',
        chatId: replyDestination
    });

    try {
        if (!sock) {
            throw new Error('Sessão WhatsApp desconectada');
        }

        const allGroups = await syncBotGroups(botId, sock, firestoreDb, currentBot);
        const adminGroups = allGroups
            .filter((g: any) => g.botIsAdmin)
            .map((g: any) => ({
                id: g.groupId,
                subject: (g.groupName || 'Grupo WhatsApp').trim()
            }));

        await recordAuditLog(firestoreDb, {
            botId,
            actorId: actorJid,
            actorRole: 'OWNER',
            action: 'ADMIN_GROUPS_SUCCESS',
            command: cleanText,
            result: 'SUCCESS',
            chatId: replyDestination,
            duration: Date.now() - startTime,
            details: `Consultados ${adminGroups.length} grupos onde o bot é admin via Baileys (${allGroups.length} grupos no total)`
        });

        if (adminGroups.length === 0) {
            await sendReply({
                text: `👑 *GRUPOS ONDE SOU ADMIN*\nTotal: 0\n\nO bot não possui privilégios de Administrador em nenhum grupo no momento.`
            });
            return;
        }

        let out = `👑 *GRUPOS ONDE SOU ADMIN*\nTotal: ${adminGroups.length}\n`;
        adminGroups.forEach((g) => {
            out += `\n• ${g.subject}`;
        });

        await sendReply({ text: out });
    } catch (err: any) {
        const errorMsg = err?.message || 'Falha na comunicação com o WhatsApp';
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: actorJid,
            actorRole: 'OWNER',
            action: 'ADMIN_GROUPS_FAILED',
            command: cleanText,
            result: 'ERROR',
            chatId: replyDestination,
            duration: Date.now() - startTime,
            errorCode: 'ADMIN_GROUPS_ERROR',
            errorMessage: errorMsg
        });

        await sendReply({
            text: `Não consegui consultar os grupos de administrador neste momento.\nErro técnico: ${errorMsg}`
        });
    }
}

export async function handleWhatsAppAdminMessage(opts: {
    sock: any;
    botId: string;
    currentBot: any;
    senderJid: string;
    groupId?: string;
    destinationJid?: string;
    senderPn?: string;
    senderLid?: string;
    fromMe?: boolean;
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
                    actorId: senderJid
                }
            });
        }
        return sock.sendMessage(replyDestination, content, options);
    };

    // 1. VERIFICAÇÃO RIGOROSA DE AUTORIZAÇÃO DO PROPRIETÁRIO NO BACKEND
    const authResult = await checkBotOwnerAuthorization({
        botId,
        currentBot,
        senderJid,
        senderPn: opts.senderPn,
        senderLid: opts.senderLid,
        fromMe: opts.fromMe,
        sock,
        firestoreDb
    });
    const isOwner = authResult.isOwner;
    const senderNumber = authResult.normalizedSender;
    const sessionKey = getSessionKey(botId, senderJid);
    const hasPending = pendingConfirmations.has(sessionKey);
    const isOwnerModeActive = ownerModeSessions.get(sessionKey) === true;
    const lower = cleanText.toLowerCase();

    // Moderação específica de grupos quando a mensagem ocorre dentro de um grupo
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

    const botRef = doc(firestoreDb, 'bots', botId);

    // 2. PARSE DETERMINÍSTICO DE INTENÇÕES OPERACIONAIS DO PROPRIETÁRIO
    const firstGeminiKey = (currentBot.geminiKeys || '').split(',')[0]?.trim() || process.env.GEMINI_API_KEY;
    const parsedIntent = await parseOwnerIntent(cleanText, firstGeminiKey);
    const isSlashCommand = cleanText.startsWith('/') || cleanText.startsWith('!');

    // Tratamento prioritário de intenções administrativas/operacionais
    if (parsedIntent) {
        // A. CLAIM_OWNER ("Eu sou o Mendes seu proprietário")
        if (parsedIntent.intent === 'CLAIM_OWNER') {
            if (isOwner) {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'OWNER',
                    action: 'OWNER_COMMAND_AUTHORIZED',
                    command: cleanText,
                    result: 'SUCCESS',
                    chatId: replyDestination,
                    details: 'Proprietário confirmou identidade'
                });
                await sendReply({ text: 'Você já está identificado como proprietário deste bot.' });
            } else {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'USER',
                    action: 'OWNER_COMMAND_DENIED',
                    command: cleanText,
                    result: 'DENIED',
                    chatId: replyDestination,
                    details: `Tentativa não autorizada de reivindicar propriedade: ${senderJid}`
                });
                await sendReply({ text: 'Não reconheço este número como proprietário autorizado.' });
            }
            return { handled: true };
        }

        // B. WHO_IS_OWNER ("Como saber quem é o seu proprietário", "Quem é o teu proprietário")
        if (parsedIntent.intent === 'WHO_IS_OWNER') {
            if (isOwner) {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'OWNER',
                    action: 'OWNER_COMMAND_AUTHORIZED',
                    command: cleanText,
                    result: 'SUCCESS',
                    chatId: replyDestination,
                    details: 'Consulta de proprietário autorizada'
                });
                const ownerDisplayName = currentBot.ownerName || 'Mendes';
                await sendReply({ text: `👤 Meu proprietário é ${ownerDisplayName}.\nPermissões: Proprietário` });
            } else {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'USER',
                    action: 'OWNER_COMMAND_DENIED',
                    command: cleanText,
                    result: 'DENIED',
                    chatId: replyDestination,
                    details: 'Consulta de proprietário negada a usuário não autorizado'
                });
                await sendReply({ text: 'Não posso revelar informações de propriedade deste bot.' });
            }
            return { handled: true };
        }

        // C. PIN_ENTRY ("123456")
        if (parsedIntent.intent === 'PIN_ENTRY') {
            if (isOwner) {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'OWNER',
                    action: 'OWNER_AUTH_SUCCESS',
                    result: 'SUCCESS',
                    chatId: replyDestination,
                    details: 'PIN digitado por proprietário já autenticado'
                });
                await sendReply({
                    text: `🔒 *Autenticação do Proprietário*\nVocê já está identificado como proprietário através do seu número autorizado. Não é necessário enviar o PIN em conversas comuns.`
                });
            } else {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'USER',
                    action: 'OWNER_AUTH_FAILED',
                    result: 'DENIED',
                    chatId: replyDestination,
                    details: 'Tentativa de autenticação por PIN não permitida em conversa comum'
                });
                await sendReply({
                    text: `⛔ *Acesso Negado*\nEste bot não aceita autenticação de proprietário por PIN em conversas abertas.`
                });
            }
            return { handled: true };
        }

        // D. Comandos operacionais: Bloquear qualquer usuário que não seja proprietário
        if (!isOwner) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderJid,
                actorPhone: senderNumber,
                actorRole: 'USER',
                action: 'OWNER_COMMAND_DENIED',
                command: cleanText,
                result: 'DENIED',
                chatId: replyDestination,
                destinationJid: replyDestination,
                chatType: isGroup ? 'GROUP' : 'PRIVATE',
                details: `Comando administrativo (${parsedIntent.intent}) recusado para não proprietário: ${senderJid}`
            });
            await sendReply({
                text: `⛔ *Acesso Negado*\nApenas o proprietário autorizado pode executar comandos de gerenciamento neste bot.`
            });
            return { handled: true };
        }

        // E. Execução de comandos operacionais pelo Proprietário AUTORIZADO
        if (parsedIntent.intent === 'LIST_GROUPS') {
            await executeGroupListCommand({
                sock,
                botId,
                actorJid: senderJid,
                replyDestination,
                firestoreDb,
                sendReply,
                cleanText,
                currentBot
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'ADMIN_GROUPS') {
            await executeAdminGroupsCommand({
                sock,
                botId,
                actorJid: senderJid,
                replyDestination,
                firestoreDb,
                sendReply,
                cleanText,
                currentBot
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'CHANGE_BOT_NAME') {
            const newName = String(parsedIntent.value || '').trim();
            if (!newName || newName.length < 1 || newName.length > 60) {
                await sendReply({ text: '⚠️ Nome inválido. O nome deve conter entre 1 e 60 caracteres.' });
                return { handled: true };
            }

            const startTime = Date.now();
            try {
                await updateDoc(botRef, { name: newName });
                currentBot.name = newName;

                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'OWNER',
                    action: 'BOT_NAME_CHANGED',
                    command: cleanText,
                    result: 'SUCCESS',
                    chatId: replyDestination,
                    duration: Date.now() - startTime,
                    details: `Nome do bot alterado para: ${newName}`
                });

                await sendReply({ text: `Nome alterado com sucesso.\nNovo nome do bot: ${newName}` });
            } catch (err: any) {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: 'OWNER',
                    action: 'BOT_NAME_CHANGE_FAILED',
                    command: cleanText,
                    result: 'ERROR',
                    chatId: replyDestination,
                    duration: Date.now() - startTime,
                    errorCode: 'FIRESTORE_WRITE_ERROR',
                    errorMessage: err?.message || 'Falha ao salvar no Firestore'
                });
                await sendReply({
                    text: `❌ Erro ao salvar o novo nome do bot no banco de dados.\nErro técnico: ${err?.message || 'Falha no Firestore'}`
                });
            }
            return { handled: true };
        }

        if (parsedIntent.intent === 'DELETE_LAST_MESSAGE') {
            const deleteResult = await deleteLastBotMessage({
                botId,
                destinationJid: replyDestination,
                actorJid: senderJid,
                actorRole: 'OWNER',
                firestoreDb,
                sock
            });
            if (!deleteResult.success) {
                await sendReply({ text: deleteResult.message });
            }
            return { handled: true };
        }
    }

    // Se NÃO for proprietário:
    if (!isOwner) {
        if (isSlashCommand) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderJid,
                actorPhone: senderNumber,
                actorRole: 'USER',
                action: 'UNAUTHORIZED_ADMIN_ATTEMPT',
                command: cleanText,
                result: 'DENIED',
                chatId: replyDestination,
                destinationJid: replyDestination,
                chatType: isGroup ? 'GROUP' : 'PRIVATE',
                details: `Tentativa de comando administrativo por número não autorizado: ${senderJid}`
            });

            await sendReply({
                text: `⛔ *Acesso Negado*\nApenas o proprietário autorizado pode executar comandos de gerenciamento neste bot.`
            });
            return { handled: true };
        }
        // Conversa normal de usuário: prosseguir para o atendimento padrão
        return { handled: false };
    }

    // Se é o proprietário, mas não é comando slash, nem está em owner mode, nem tem ação pendente:
    if (!isSlashCommand && !isOwnerModeActive && !hasPending) {
        return { handled: false };
    }

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
        await executeAdminGroupsCommand({
            sock,
            botId,
            actorJid: senderJid,
            replyDestination,
            firestoreDb,
            sendReply,
            cleanText
        });
        return { handled: true };
    }

    if (cmd === '/grupos' || cmd === '!grupos') {
        await executeGroupListCommand({
            sock,
            botId,
            actorJid: senderJid,
            replyDestination,
            firestoreDb,
            sendReply,
            cleanText
        });
        return { handled: true };
    }

    if (cmd.startsWith('/nome ') || cmd.startsWith('!nome ')) {
        const newName = cleanText.substring(5).trim();
        if (!newName || newName.length < 1 || newName.length > 60) {
            await sendReply({ text: '⚠️ Nome inválido. Uso: */nome <NovoNome>* (entre 1 e 60 caracteres)' });
            return { handled: true };
        }
        const startTime = Date.now();
        try {
            await updateDoc(botRef, { name: newName });
            currentBot.name = newName;
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderJid,
                actorRole: 'OWNER',
                action: 'BOT_NAME_CHANGED',
                command: cleanText,
                result: 'SUCCESS',
                chatId: replyDestination,
                duration: Date.now() - startTime,
                details: `Nome do bot alterado para: ${newName}`
            });
            await sendReply({ text: `Nome alterado com sucesso.\nNovo nome do bot: ${newName}` });
        } catch (err: any) {
            await sendReply({ text: `❌ Erro ao salvar novo nome: ${err?.message || 'Falha no banco de dados'}` });
        }
        return { handled: true };
    }

    if (cmd === '/apagar' || cmd === '/del' || cmd === '/delete' || cmd === '!apagar') {
        const deleteResult = await deleteLastBotMessage({
            botId,
            destinationJid: replyDestination,
            actorJid: senderJid,
            actorRole: 'OWNER',
            firestoreDb,
            sock
        });
        if (!deleteResult.success) {
            await sendReply({ text: deleteResult.message });
        }
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
