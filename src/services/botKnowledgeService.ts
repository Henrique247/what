import { Firestore, collection, getDocs, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { recordAuditLog } from '../audit';
import { syncBotGroups } from './whatsappIdentity';

export interface BotGroupItem {
    groupId: string;
    groupName: string;
    participantCount: number;
    botIsAdmin: boolean;
    botRole?: string;
    owner?: string;
    lastSyncedAt?: string;
}

export interface BotGroupSummary {
    totalGroups: number;
    adminGroups: number;
    memberGroups: number;
    groups: BotGroupItem[];
    adminGroupList: BotGroupItem[];
    lastSyncedAt?: string;
}

export type OperationalIntentType = 
    | 'GROUPS_AND_ADMIN'
    | 'GROUPS_COUNT'
    | 'ADMIN_GROUPS'
    | 'LIST_GROUPS'
    | 'WHO_IS_OWNER'
    | 'WHO_AM_I'
    | 'BOT_STATUS'
    | 'BOT_STATS';

export interface OperationalClassification {
    intent: OperationalIntentType;
    confidence: number;
    isHybrid?: boolean;
    details?: string;
}

export interface BotOperationalContext {
    botId: string;
    botName: string;
    ownerName: string;
    ownerNumber: string;
    ownerLid?: string;
    connectionStatus: string;
    groupCount: number;
    adminGroupCount: number;
    memberGroupCount: number;
    adminGroupNames: string[];
    groups: Array<{
        id: string;
        name: string;
        isAdmin: boolean;
        participantCount: number;
    }>;
    memoryEnabled: boolean;
    respondInGroups: boolean;
    respondInPrivate: boolean;
    sender: {
        jid: string;
        normalizedPhone: string;
        isOwner: boolean;
        role: 'OWNER' | 'USER';
        identityType: string;
    };
}

/**
 * Retrieves all synchronized groups for a bot from Firestore cache.
 * If the cache is empty and a Baileys socket is available, triggers synchronization via syncBotGroups.
 */
export async function getBotGroups(
    botId: string,
    firestoreDb: Firestore,
    sock?: any,
    currentBot?: any,
    forceRefresh: boolean = false
): Promise<BotGroupItem[]> {
    const groupsList: BotGroupItem[] = [];

    try {
        // If forceRefresh is requested or if socket is available and cache might need sync
        if (forceRefresh && sock) {
            const synced = await syncBotGroups(botId, sock, firestoreDb, currentBot);
            return synced.map(g => ({
                groupId: g.groupId,
                groupName: g.groupName || 'Grupo WhatsApp',
                participantCount: g.participantCount || 0,
                botIsAdmin: !!g.botIsAdmin,
                botRole: g.botRole || (g.botIsAdmin ? 'admin' : 'participant'),
                owner: g.owner || '',
                lastSyncedAt: g.lastSyncedAt || new Date().toISOString()
            }));
        }

        // Consult Firestore cache
        const groupsCollRef = collection(firestoreDb, 'bots', botId, 'groups');
        const snap = await getDocs(groupsCollRef);

        if (!snap.empty) {
            snap.forEach(d => {
                const data = d.data();
                groupsList.push({
                    groupId: data.groupId || d.id,
                    groupName: data.groupName || data.name || 'Grupo WhatsApp',
                    participantCount: data.participantCount || data.size || 0,
                    botIsAdmin: !!data.botIsAdmin || data.botRole === 'admin' || data.botRole === 'superadmin',
                    botRole: data.botRole || (data.botIsAdmin ? 'admin' : 'participant'),
                    owner: data.owner || '',
                    lastSyncedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : data.lastSyncedAt
                });
            });
            return groupsList;
        }

        // If cache in Firestore was empty and sock is available, synchronize now
        if (sock) {
            const synced = await syncBotGroups(botId, sock, firestoreDb, currentBot);
            return synced.map(g => ({
                groupId: g.groupId,
                groupName: g.groupName || 'Grupo WhatsApp',
                participantCount: g.participantCount || 0,
                botIsAdmin: !!g.botIsAdmin,
                botRole: g.botRole || (g.botIsAdmin ? 'admin' : 'participant'),
                owner: g.owner || '',
                lastSyncedAt: g.lastSyncedAt || new Date().toISOString()
            }));
        }

        return groupsList;
    } catch (err: any) {
        console.error(`[Bot ${botId}] Erro ao buscar grupos no serviço de conhecimento:`, err);
        return groupsList;
    }
}

/**
 * Retrieves only groups where the bot is administrator.
 */
export async function getBotAdminGroups(
    botId: string,
    firestoreDb: Firestore,
    sock?: any,
    currentBot?: any
): Promise<BotGroupItem[]> {
    const all = await getBotGroups(botId, firestoreDb, sock, currentBot);
    return all.filter(g => g.botIsAdmin);
}

/**
 * Returns a complete summary of groups (total count, admin count, member count and group list).
 */
export async function getBotGroupSummary(
    botId: string,
    firestoreDb: Firestore,
    sock?: any,
    currentBot?: any
): Promise<BotGroupSummary> {
    const allGroups = await getBotGroups(botId, firestoreDb, sock, currentBot);
    const adminGroupList = allGroups.filter(g => g.botIsAdmin);
    const memberGroups = allGroups.length - adminGroupList.length;

    return {
        totalGroups: allGroups.length,
        adminGroups: adminGroupList.length,
        memberGroups: Math.max(0, memberGroups),
        groups: allGroups,
        adminGroupList,
        lastSyncedAt: allGroups[0]?.lastSyncedAt || new Date().toISOString()
    };
}

/**
 * Classifies if a user message is an operational/factual query about the bot state.
 */
export function classifyOperationalIntent(text: string): OperationalClassification | null {
    if (!text || typeof text !== 'string') return null;

    const clean = text.trim();
    const normalized = clean
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[?!.,;:_~`'"\\/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    // 1. Pergunta combinada: Quantidade de grupos E quais é admin
    // Ex: "Em quantos grupos estás incluídos e quais és admin", "quantos grupos e quais administras"
    const isGroupsAndAdmin = (
        (normalized.includes('quantos grupos') || normalized.includes('em que grupos') || normalized.includes('em quantos grupos')) &&
        (normalized.includes('admin') || normalized.includes('administra') || normalized.includes('administrador') || normalized.includes('quais es') || normalized.includes('quais sao'))
    ) || (
        normalized.includes('grupos estas') && (normalized.includes('admin') || normalized.includes('administrador'))
    );

    if (isGroupsAndAdmin) {
        return { intent: 'GROUPS_AND_ADMIN', confidence: 0.98 };
    }

    // 2. Pergunta sobre quais grupos administra / é admin
    // Ex: "Em quais grupos és admin?", "Quais grupos administras?", "Mostra os grupos onde és administrador", "Onde és admin?"
    const isAdminGroups = (
        /^(?:em\s+)?quais\s+(?:sao\s+os\s+)?grupos\s+(?:que\s+)?(?:es|voce\s+e|tu\s+es|administras|e)\s*(?:admin|administrador|adm)?/i.test(normalized) ||
        /^(?:onde\s+es\s+(?:admin|administrador)|quais\s+grupos\s+administras|mostra\s+(?:os\s+)?grupos\s+(?:onde\s+es|que\s+es)\s+(?:admin|administrador)|grupos\s+onde\s+sou\s+admin|grupos\s+onde\s+es\s+admin|lista\s+grupos\s+admin)/i.test(normalized) ||
        normalized === 'grupos admin' || normalized === 'admin grupos' || normalized === 'quais grupos es admin' || normalized === 'quais grupos administras'
    );

    if (isAdminGroups) {
        return { intent: 'ADMIN_GROUPS', confidence: 0.95 };
    }

    // 3. Pergunta sobre quantidade total de grupos
    // Ex: "Em quantos grupos estás?", "Em quantos grupos estás incluídos?", "Quantos grupos temos?", "Quantos grupos tens?", "Quantos grupos o bot tem?"
    const isGroupsCount = (
        /^(?:em\s+)?quantos\s+grupos\s+(?:estas|estas\s+incluido|estas\s+incluidos|tens|voce\s+tem|temos|o\s+bot\s+tem|estas\s+inserido|participas|voce\s+esta)/i.test(normalized) ||
        /^quantos\s+grupos\s+(?:no\s+whatsapp|tens\s+no\s+whatsapp)?$/i.test(normalized) ||
        normalized === 'quantidade de grupos' || normalized === 'total de grupos' || normalized === 'quantos grupos'
    );

    if (isGroupsCount) {
        return { intent: 'GROUPS_COUNT', confidence: 0.95 };
    }

    // 4. Pergunta para listar todos os grupos
    // Ex: "Mostra todos os teus grupos", "Lista de grupos", "Quais grupos participas?"
    const isListGroups = (
        /^(?:mostra|mostrar|lista|listar|ver)\s+(?:todos\s+os\s+)?grupos(?:\s+que\s+participas|\s+do\s+bot)?$/i.test(normalized) ||
        normalized === 'lista de grupos' || normalized === 'meus grupos' || normalized === 'todos os grupos'
    );

    if (isListGroups) {
        return { intent: 'LIST_GROUPS', confidence: 0.90 };
    }

    // 5. Quem é o proprietário / dono do bot
    // Ex: "Quem é o proprietário?", "Quem é o teu dono?", "Quem te controla?", "Quem te administra?"
    const isWhoIsOwner = (
        /^(?:quem\s+e\s+(?:o\s+)?(?:teu|seu|deste\s+bot)?\s*(?:proprietario|dono|administrador|criador|mestre)|quem\s+te\s+(?:administra|controla|criou|programou)|de\s+quem\s+e\s+(?:esse|este)\s+bot|como\s+saber\s+quem\s+e\s+o\s+proprietario)$/i.test(normalized) ||
        normalized === 'proprietario' || normalized === 'dono do bot'
    );

    if (isWhoIsOwner) {
        return { intent: 'WHO_IS_OWNER', confidence: 0.95 };
    }

    // 6. "Quem eu sou?" / Identidade do usuário atual
    // Ex: "Quem eu sou?", "Quem sou eu?", "Qual é o meu nível?", "Quais são minhas permissões?", "Sou admin?", "Eu sou o dono?"
    const isWhoAmI = (
        /^(?:quem\s+eu\s+sou|quem\s+sou\s+eu|qual\s+e\s+o\s+meu\s+(?:nivel|papel|cargo|status)|quais\s+sao\s+(?:as\s+)?minhas\s+permissoes|minhas\s+permissoes|eu\s+sou\s+(?:o\s+)?(?:dono|proprietario|admin)|sou\s+admin\??|qual\s+meu\s+nivel)$/i.test(normalized)
    );

    if (isWhoAmI) {
        return { intent: 'WHO_AM_I', confidence: 0.96 };
    }

    // 7. Status do Bot
    // Ex: "Qual é o teu status?", "Status do bot", "Qual é o teu estado?", "Como estás funcionando?"
    const isBotStatus = (
        /^(?:qual\s+e\s+(?:o\s+)?(?:teu|seu)?\s*(?:status|estado)|status\s+do\s+bot|estado\s+do\s+bot|como\s+estas\s+funcionando)$/i.test(normalized)
    );

    if (isBotStatus) {
        return { intent: 'BOT_STATUS', confidence: 0.92 };
    }

    // 8. Estatísticas do Bot
    // Ex: "Quantas mensagens recebeste?", "Quantas mensagens já foram processadas?", "Estatísticas do bot"
    const isBotStats = (
        /^(?:quantas\s+mensagens\s+(?:recebeste|ja\s+recebeste|foram\s+processadas|o\s+bot\s+respondeu)|estatisticas\s+do\s+bot|ver\s+estatisticas|estatisticas)$/i.test(normalized)
    );

    if (isBotStats) {
        return { intent: 'BOT_STATS', confidence: 0.90 };
    }

    return null;
}

/**
 * Builds the complete operational context of the bot using live data from Firestore and memory.
 */
export async function getBotOperationalContext(params: {
    botId: string;
    firestoreDb: Firestore;
    sock?: any;
    currentBot?: any;
    senderJid?: string;
    senderPn?: string;
    senderLid?: string;
    isOwner?: boolean;
}): Promise<BotOperationalContext> {
    const { botId, firestoreDb, sock, currentBot, senderJid, senderPn, isOwner } = params;

    const botDocData = currentBot || {};
    const botName = botDocData.name || 'Assistente TechStar';
    const ownerName = botDocData.ownerName || 'Mendes';
    const ownerNumber = botDocData.ownerNumber || '';
    const ownerLid = botDocData.ownerLid || '';
    const connectionStatus = sock ? 'Conectado e Operacional' : 'Modo Backend / Cache';

    // Get group summary from Firestore / Baileys
    const groupSummary = await getBotGroupSummary(botId, firestoreDb, sock, currentBot);

    const safeGroups = groupSummary.groups.map(g => ({
        id: g.groupId,
        name: g.groupName,
        isAdmin: g.botIsAdmin,
        participantCount: g.participantCount
    }));

    const adminGroupNames = groupSummary.adminGroupList.map(g => g.groupName);

    const normalizedPhone = senderPn ? senderPn.replace(/@.*$/, '') : (senderJid ? senderJid.replace(/@.*$/, '') : '');

    return {
        botId,
        botName,
        ownerName,
        ownerNumber,
        ownerLid,
        connectionStatus,
        groupCount: groupSummary.totalGroups,
        adminGroupCount: groupSummary.adminGroups,
        memberGroupCount: groupSummary.memberGroups,
        adminGroupNames,
        groups: safeGroups,
        memoryEnabled: botDocData.memoryEnabled !== false,
        respondInGroups: botDocData.respondInGroups !== false,
        respondInPrivate: botDocData.respondInPrivate !== false,
        sender: {
            jid: senderJid || '',
            normalizedPhone,
            isOwner: !!isOwner,
            role: isOwner ? 'OWNER' : 'USER',
            identityType: senderJid?.endsWith('@lid') ? 'LID' : 'PHONE_NUMBER'
        }
    };
}

/**
 * Generates an assertive operational context snippet to inject into Gemini system instructions.
 * This guarantees the AI knows about its real-world WhatsApp connection, group count, and admin status.
 */
export function generateOperationalSystemPromptSnippet(context: BotOperationalContext): string {
    const adminGroupsPreview = context.adminGroupNames.slice(0, 10).join(', ');
    const adminGroupsText = context.adminGroupCount > 0 
        ? `${context.adminGroupCount} grupos (${adminGroupsPreview}${context.adminGroupCount > 10 ? ` e mais ${context.adminGroupCount - 10} grupos` : ''})`
        : '0 grupos';

    return `
=== CONTEXTO OPERACIONAL E FACTUAL DO BOT NO WHATSAPP ===
- Nome Oficial do Bot: ${context.botName}
- Status da Conexão: ${context.connectionStatus}
- Proprietário Autorizado: ${context.ownerName}
- Presença em Grupos do WhatsApp: O bot participa ativamente de EXATAMENTE ${context.groupCount} grupos.
- Privilégios de Administrador: O bot é ADMINISTRADOR em EXATAMENTE ${context.adminGroupCount} grupos (${adminGroupsText}).
- Interlocutor Atual: ${context.sender.isOwner ? `O PROPRIETÁRIO DO BOT (${context.ownerName})` : `UM USUÁRIO COMUM (${context.sender.normalizedPhone})`}
- Nível de Acesso do Interlocutor: ${context.sender.isOwner ? 'Proprietário (Acesso Total e irrestrito)' : 'Usuário Padrão'}

DIRETRIZES DE IDENTIDADE FACTUAL (OBRIGATÓRIAS):
1. Você é uma inteligência artificial conectada e operacional no WhatsApp através desta instância do bot "${context.botName}".
2. Você PARTICIPA SIM de grupos de WhatsApp e possui permissões de administrador nos grupos indicados. NUNCA negue sua participação em grupos nem diga que "é apenas uma IA sem acesso a grupos".
3. Se o usuário perguntar sobre grupos, estatísticas ou propriedade, utilize SEMPRE os dados factuais exatos fornecidos acima.
4. Se o usuário perguntar "Quem eu sou?", responda de acordo com o Interlocutor Atual indicado acima.
5. NUNCA revele chaves de API, senhas, tokens, PINs ou segredos internos do sistema.
=========================================================`;
}

/**
 * Handles purely operational and factual queries directly from backend data without needing Gemini.
 * This operates deterministically even if Gemini is completely offline.
 */
export async function handleOperationalKnowledgeQuery(params: {
    text: string;
    botId: string;
    firestoreDb: Firestore;
    sock?: any;
    currentBot?: any;
    senderJid: string;
    senderPn?: string;
    senderLid?: string;
    isOwner: boolean;
    chatType: string;
    destinationJid: string;
    sendReply: (content: any, options?: any) => Promise<any>;
}): Promise<{ handled: boolean; responseText?: string; intent?: OperationalIntentType }> {
    const { text, botId, firestoreDb, sock, currentBot, senderJid, senderPn, isOwner, chatType, destinationJid, sendReply } = params;

    const classification = classifyOperationalIntent(text);
    if (!classification) {
        return { handled: false };
    }

    const { intent } = classification;
    const startTime = Date.now();

    await recordAuditLog(firestoreDb, {
        botId,
        actorId: senderJid,
        actorRole: isOwner ? 'OWNER' : 'USER',
        action: 'OPERATIONAL_CONTEXT_REQUEST',
        command: text,
        chatId: destinationJid,
        chatType,
        result: 'SUCCESS',
        details: `Classificação operacional identificada: intent=${intent}, isOwner=${isOwner}`
    });

    try {
        const context = await getBotOperationalContext({
            botId,
            firestoreDb,
            sock,
            currentBot,
            senderJid,
            senderPn,
            senderLid: params.senderLid,
            isOwner
        });

        let responseText = '';

        switch (intent) {
            case 'GROUPS_AND_ADMIN': {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: isOwner ? 'OWNER' : 'USER',
                    action: 'GROUP_CONTEXT_REQUEST',
                    command: text,
                    result: 'SUCCESS',
                    details: `Consulta combinada: ${context.groupCount} grupos totais, ${context.adminGroupCount} como administrador`
                });

                if (context.groupCount === 0) {
                    responseText = `📊 *Informações de Grupos*\n\nAtualmente não estou presente em nenhum grupo do WhatsApp.`;
                } else {
                    let adminListText = '';
                    if (context.adminGroupCount > 0) {
                        const displayLimit = 25;
                        const displayedAdmins = context.groups
                            .filter(g => g.isAdmin)
                            .slice(0, displayLimit)
                            .map((g, idx) => `${idx + 1}. 👑 *${g.name}* (${g.participantCount} participantes)`)
                            .join('\n');
                        
                        const remaining = context.adminGroupCount - displayLimit;
                        adminListText = `\n\n*Grupos onde sou Administrador (${context.adminGroupCount}):*\n${displayedAdmins}${remaining > 0 ? `\n... e mais ${remaining} outros grupos administrados.` : ''}`;
                    } else {
                        adminListText = `\n\nNão possuo privilégios de administrador em nenhum dos grupos atuais.`;
                    }

                    responseText = `📊 *Status de Grupos no WhatsApp*\n\n• *Total de Grupos:* ${context.groupCount}\n• *Como Administrador:* ${context.adminGroupCount}\n• *Como Membro Comum:* ${context.memberGroupCount}${adminListText}`;
                }
                break;
            }

            case 'GROUPS_COUNT': {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: isOwner ? 'OWNER' : 'USER',
                    action: 'GROUP_CONTEXT_REQUEST',
                    command: text,
                    result: 'SUCCESS',
                    details: `Consulta de contagem: ${context.groupCount} grupos totais (${context.adminGroupCount} admins)`
                });

                if (context.groupCount === 0) {
                    responseText = `Atualmente não estou incluído em nenhum grupo no WhatsApp.`;
                } else if (context.adminGroupCount > 0) {
                    responseText = `Estou incluído em *${context.groupCount}* grupos no WhatsApp no total (sendo administrador em *${context.adminGroupCount}* deles).`;
                } else {
                    responseText = `Estou incluído em *${context.groupCount}* grupos no WhatsApp no total (como membro participante).`;
                }
                break;
            }

            case 'ADMIN_GROUPS': {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: isOwner ? 'OWNER' : 'USER',
                    action: 'ADMIN_GROUP_CONTEXT_REQUEST',
                    command: text,
                    result: 'SUCCESS',
                    details: `Consulta de grupos admin: ${context.adminGroupCount} grupos encontrados`
                });

                if (context.adminGroupCount === 0) {
                    responseText = `👑 *Grupos como Administrador*\n\nNão possuo privilégios de administrador em nenhum grupo no momento (estou em ${context.groupCount} grupos no total).`;
                } else {
                    const displayLimit = 30;
                    const adminItems = context.groups
                        .filter(g => g.isAdmin)
                        .slice(0, displayLimit)
                        .map((g, idx) => `${idx + 1}. 👑 *${g.name}* (${g.participantCount} membros)`)
                        .join('\n');

                    const remaining = context.adminGroupCount - displayLimit;
                    responseText = `👑 *Grupos onde sou Administrador*\nTotal: *${context.adminGroupCount}* de *${context.groupCount}* grupos\n\n${adminItems}${remaining > 0 ? `\n\n... e mais ${remaining} grupos administrados.` : ''}`;
                }
                break;
            }

            case 'LIST_GROUPS': {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: isOwner ? 'OWNER' : 'USER',
                    action: 'GROUP_CONTEXT_REQUEST',
                    command: text,
                    result: 'SUCCESS',
                    details: `Listagem completa de grupos: ${context.groupCount} grupos`
                });

                if (context.groupCount === 0) {
                    responseText = `📁 *Lista de Grupos*\n\nO bot não está presente em nenhum grupo no momento.`;
                } else {
                    const displayLimit = 25;
                    const items = context.groups
                        .slice(0, displayLimit)
                        .map((g, idx) => `${idx + 1}. ${g.isAdmin ? '👑' : '👥'} *${g.name}* (${g.participantCount} membros - ${g.isAdmin ? 'Admin' : 'Membro'})`)
                        .join('\n');

                    const remaining = context.groupCount - displayLimit;
                    responseText = `📁 *Grupos do Bot*\nTotal: *${context.groupCount}* grupos (${context.adminGroupCount} como admin)\n\n${items}${remaining > 0 ? `\n\n... e mais ${remaining} grupos.` : ''}`;
                }
                break;
            }

            case 'WHO_IS_OWNER': {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: isOwner ? 'OWNER' : 'USER',
                    action: 'OPERATIONAL_CONTEXT_SUCCESS',
                    command: text,
                    result: 'SUCCESS',
                    details: `Consulta de proprietário atendida: ${context.ownerName}`
                });

                responseText = `👤 Meu proprietário é *${context.ownerName}*.\nPermissões: Proprietário Autorizado`;
                break;
            }

            case 'WHO_AM_I': {
                await recordAuditLog(firestoreDb, {
                    botId,
                    actorId: senderJid,
                    actorRole: isOwner ? 'OWNER' : 'USER',
                    action: 'OPERATIONAL_CONTEXT_SUCCESS',
                    command: text,
                    result: 'SUCCESS',
                    details: `Consulta de identidade do interlocutor: isOwner=${isOwner}, sender=${senderJid}`
                });

                if (isOwner) {
                    responseText = `👑 *Você é o Proprietário deste bot (${context.ownerName})*.\n\n• *Permissões:* Acesso Administrativo Total\n• *Controle:* Configurações, memória, moderação e grupos\n• *Identificador:* ${context.sender.normalizedPhone || senderJid}`;
                } else {
                    responseText = `👤 *Você é um usuário deste bot*.\n\n• *Nível:* Usuário Padrão\n• *Permissões:* Interação e atendimento nas conversas e grupos autorizados\n• *Identificador:* ${context.sender.normalizedPhone || senderJid}`;
                }
                break;
            }

            case 'BOT_STATUS': {
                responseText = `⚡ *Status Operacional do Bot*\n\n• *Nome:* ${context.botName}\n• *Proprietário:* ${context.ownerName}\n• *Conexão:* ${context.connectionStatus}\n• *Grupos Conectados:* ${context.groupCount} (${context.adminGroupCount} admins)\n• *Memória de Contexto:* ${context.memoryEnabled ? 'Ativada' : 'Desativada'}\n• *Respostas Privadas:* ${context.respondInPrivate ? 'Ativadas' : 'Desativadas'}\n• *Respostas em Grupos:* ${context.respondInGroups ? 'Ativadas' : 'Desativadas'}`;
                break;
            }

            case 'BOT_STATS': {
                responseText = `📈 *Estatísticas Operacionais*\n\n• *Grupos no WhatsApp:* ${context.groupCount} no total\n• *Grupos sob Administração:* ${context.adminGroupCount}\n• *Status do Sistema:* Operacional e Ativo`;
                break;
            }
        }

        if (responseText) {
            await sendReply({ text: responseText });

            await recordAuditLog(firestoreDb, {
                botId,
                actorId: senderJid,
                actorRole: isOwner ? 'OWNER' : 'USER',
                action: 'OPERATIONAL_CONTEXT_SUCCESS',
                command: text,
                chatId: destinationJid,
                chatType,
                result: 'SUCCESS',
                duration: Date.now() - startTime,
                details: `Resposta factual operacional enviada com sucesso para intent ${intent}`
            });

            return { handled: true, responseText, intent };
        }

        return { handled: false };
    } catch (err: any) {
        console.error(`[Bot ${botId}] Erro ao processar pergunta operacional factual:`, err);
        await recordAuditLog(firestoreDb, {
            botId,
            actorId: senderJid,
            actorRole: isOwner ? 'OWNER' : 'USER',
            action: 'GROUP_CONTEXT_FETCH_FAILED',
            command: text,
            result: 'ERROR',
            chatId: destinationJid,
            errorMessage: err.message || String(err),
            details: 'Neste momento não foi possível consultar os dados operacionais do bot no backend.'
        });

        await sendReply({
            text: `Neste momento não consegui consultar a lista atualizada de dados operacionais do bot.`
        });

        return { handled: true, responseText: 'Neste momento não consegui consultar a lista atualizada de dados operacionais do bot.', intent };
    }
}
