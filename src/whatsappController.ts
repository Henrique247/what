import { doc, updateDoc, collection, getDocs, writeBatch, Firestore, query, orderBy, limit } from 'firebase/firestore';
import { isPhoneMatch, normalizePhone, hasPermission, PERMISSIONS } from './security';
import { recordAuditLog, fetchAuditLogs } from './audit';
import { GoogleGenAI } from '@google/genai';

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
                model: 'gemini-3.8-flash',
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

export async function handleWhatsAppAdminMessage(opts: {
    sock: any;
    botId: string;
    currentBot: any;
    senderJid: string;
    text: string;
    firestoreDb: Firestore;
    isGroup: boolean;
    onResetBot?: (botId: string) => Promise<void>;
}): Promise<{ handled: boolean }> {
    const { sock, botId, currentBot, senderJid, text, firestoreDb, isGroup, onResetBot } = opts;
    const cleanText = (text || '').trim();
    if (!cleanText) return { handled: false };

    // 1. IDENTIFICAÇÃO DO REMETENTE
    const senderNumber = normalizePhone(senderJid);
    const ownerNumber = normalizePhone(currentBot.ownerPhone || currentBot.ownerNumber);
    const isOwner = isPhoneMatch(senderNumber, ownerNumber);
    const sessionKey = getSessionKey(botId, senderJid);
    const hasPending = pendingConfirmations.has(sessionKey);
    const isOwnerModeActive = ownerModeSessions.get(sessionKey) === true;
    const lower = cleanText.toLowerCase();

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
        // Se um usuário comum tentar qualquer comando administrativo ou tentar fingir ser proprietário
        if (isSlashCommand || isIntentKeyword) {
            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderNumber,
                actorPhone: senderNumber,
                actorRole: 'USER',
                action: 'UNAUTHORIZED_ADMIN_ATTEMPT',
                command: cleanText,
                result: 'DENIED',
                details: `Tentativa de comando administrativo por número não autorizado: ${senderNumber}`
            });

            await sock.sendMessage(senderJid, {
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
            await sock.sendMessage(senderJid, {
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

                    await sock.sendMessage(senderJid, {
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

                    await sock.sendMessage(senderJid, {
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

                    await sock.sendMessage(senderJid, {
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

                    await sock.sendMessage(senderJid, {
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
                await sock.sendMessage(senderJid, {
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

            await sock.sendMessage(senderJid, {
                text: `❌ *Ação Cancelada*\nNenhuma alteração foi realizada.`
            });
            return { handled: true };
        } else {
            await sock.sendMessage(senderJid, {
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
            await sock.sendMessage(senderJid, {
                text: `📝 *Nova mensagem:*\n\n${payload.newWelcome}\n\nDeseja aplicar?\n\n*SIM* / *NÃO*`
            });
        } else {
            await sock.sendMessage(senderJid, {
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

        await sock.sendMessage(senderJid, {
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

        await sock.sendMessage(senderJid, {
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

        await sock.sendMessage(senderJid, { text: menuText });
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

        await sock.sendMessage(senderJid, { text: statusMsg });
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
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
        await sock.sendMessage(senderJid, { text: `🧠 Memória de contexto ativada.` });
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
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
        await sock.sendMessage(senderJid, { text: `🧠 Memória de contexto desativada.` });
        return { handled: true };
    }

    if (cmd === '/memoria') {
        await sock.sendMessage(senderJid, {
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
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
        await sock.sendMessage(senderJid, { text: `👥 Respostas em grupos foram ativadas.` });
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
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
        await sock.sendMessage(senderJid, { text: `👥 Respostas em grupos foram desativadas.` });
        return { handled: true };
    }

    if (cmd === '/grupos') {
        await sock.sendMessage(senderJid, {
            text: `👥 *RESPOSTAS EM GRUPOS*\n\nEstado atual: ${currentBot.respondInGroups ? '🟢 Ativas' : '🔴 Desativadas'}\n\nComandos:\n• */grupos on* — Ativa respostas em grupos\n• */grupos off* — Desativa respostas em grupos`
        });
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
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
        await sock.sendMessage(senderJid, { text: `💬 Respostas no privado foram ativadas.` });
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
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
        await sock.sendMessage(senderJid, { text: `💬 Respostas no privado foram desativadas.` });
        return { handled: true };
    }

    if (cmd === '/privado') {
        await sock.sendMessage(senderJid, {
            text: `💬 *CONVERSAS PRIVADAS*\n\nEstado atual: ${currentBot.respondInPrivate ? '🟢 Ativas' : '🔴 Desativadas'}\n\nComandos:\n• */privado on* — Ativa conversas privadas\n• */privado off* — Desativa conversas privadas`
        });
        return { handled: true };
    }

    // 10. GERENCIAMENTO DA BASE DE CONHECIMENTO
    if (cmd === '/conhecimento' || cmd === '!conhecimento') {
        const kbText = currentBot.knowledgeBase || '';
        const kbChars = kbText.length;
        await sock.sendMessage(senderJid, {
            text: `📚 *BASE DE CONHECIMENTO*\n\n• Caracteres cadastrados: ${kbChars}\n• Estado: ${kbChars > 0 ? '🟢 Ativa e Indexada' : '⚪ Vazia'}\n\nPara consultar o conteúdo:\n*/conhecimento listar*\n\nPara apagar todo o conteúdo (Ação Crítica):\n*/conhecimento limpar*`
        });
        return { handled: true };
    }

    if (cmd === '/conhecimento listar' || cmd === '!conhecimento listar') {
        if (!hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE)) {
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        const kbText = currentBot.knowledgeBase || '';
        if (!kbText) {
            await sock.sendMessage(senderJid, { text: `📚 A base de conhecimento deste bot está atualmente vazia.` });
            return { handled: true };
        }
        const preview = kbText.length > 500 ? kbText.substring(0, 500) + '...\n\n_(conteúdo truncado para visualização)_' : kbText;
        await sock.sendMessage(senderJid, {
            text: `📚 *CONTEÚDO DA BASE DE CONHECIMENTO*\n\n${preview}`
        });
        return { handled: true };
    }

    if (cmd === '/conhecimento limpar' || cmd === '!conhecimento limpar' || cmd === '/limpar base') {
        if (!hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE)) {
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await triggerCritical('CLEAR_KNOWLEDGE', 'toda a base de conhecimento');
        return { handled: true };
    }

    // 11. GERENCIAMENTO DA IA
    if (cmd === '/ia' || cmd === '/ia status' || cmd === '!ia') {
        const hasKeys = !!(currentBot.geminiKeys && currentBot.geminiKeys.trim().length > 0);
        const keysCount = hasKeys ? currentBot.geminiKeys.split(',').length : 0;

        await sock.sendMessage(senderJid, {
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

        await sock.sendMessage(senderJid, {
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
            await sock.sendMessage(senderJid, { text: `📋 Nenhum log registrado recentemente.` });
            return { handled: true };
        }

        let msg = `📋 *ÚLTIMA ATIVIDADE (AUDITORIA)*\n\n`;
        logs.forEach(l => {
            const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Recente';
            const icon = l.result === 'SUCCESS' ? '✅' : l.result === 'DENIED' ? '⛔' : '❌';
            msg += `${icon} *${l.action}* (${l.role || 'SISTEMA'})\nHorário: ${timeStr} | Resultado: ${l.result}\n\n`;
        });

        await sock.sendMessage(senderJid, { text: msg.trim() });
        return { handled: true };
    }

    // 14. RESET DE SESSÃO
    if (cmd === '/resetar' || cmd === '/desconectar') {
        if (!hasPermission(currentBot, PERMISSIONS.WHATSAPP_MANAGE)) {
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await triggerCritical('RESET_SESSION', 'desconectar e reiniciar a sessão WhatsApp');
        return { handled: true };
    }

    // 15. LIMPAR MEMÓRIA EXPLICITAMENTE
    if (cmd === '/limpar memoria' || cmd === '/limpar historico') {
        if (!hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
            await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
            return { handled: true };
        }
        await triggerCritical('CLEAR_HISTORY', 'toda a memória');
        return { handled: true };
    }

    // 16. PROCESSAMENTO POR LINGUAGEM NATURAL (NLU E INTENT MAPPING)
    const firstGeminiKey = (currentBot.geminiKeys || '').split(',')[0]?.trim();
    const parsedIntent = await parseOwnerIntent(cleanText, firstGeminiKey);

    if (parsedIntent) {
        if (parsedIntent.intent === 'UPDATE_MEMORY') {
            if (!hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
                await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
            await sock.sendMessage(senderJid, {
                text: val ? `🧠 Memória de contexto ativada.` : `🧠 Memória de contexto desativada.`
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'UPDATE_GROUPS') {
            if (!hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
                await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
            await sock.sendMessage(senderJid, {
                text: val ? `👥 Respostas em grupos foram ativadas.` : `👥 Respostas em grupos foram desativadas.`
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'UPDATE_PRIVATE') {
            if (!hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE)) {
                await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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
            await sock.sendMessage(senderJid, {
                text: val ? `💬 Respostas no privado foram ativadas.` : `💬 Respostas no privado foram desativadas.`
            });
            return { handled: true };
        }

        if (parsedIntent.intent === 'UPDATE_WELCOME_MESSAGE') {
            if (!hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE)) {
                await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
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

            await sock.sendMessage(senderJid, { text: statusMsg });
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

            await sock.sendMessage(senderJid, {
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
                await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            await triggerCritical('CLEAR_HISTORY', 'toda a memória');
            return { handled: true };
        }

        if (parsedIntent.intent === 'CLEAR_KNOWLEDGE') {
            if (!hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE)) {
                await sock.sendMessage(senderJid, { text: `⛔ Você não possui permissão para executar esta ação.` });
                return { handled: true };
            }
            await triggerCritical('CLEAR_KNOWLEDGE', 'toda a base de conhecimento');
            return { handled: true };
        }
    }

    // Se estiver em modo proprietário e digitou comando slash inválido
    if (isOwnerModeActive && isSlashCommand) {
        await sock.sendMessage(senderJid, {
            text: `❓ *Comando não reconhecido.*\nDigite */ajuda* para consultar os comandos ou */sair* para voltar ao atendimento normal.`
        });
        return { handled: true };
    }

    // Se o proprietário estiver conversando normalmente, deixa passar para o chat com a IA
    return { handled: false };
}
