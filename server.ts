import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { createServer as createViteServer } from 'vite';
import * as baileysLib from '@whiskeysockets/baileys';
const makeWASocket = (baileysLib as any).makeWASocket || (baileysLib as any).default?.makeWASocket || baileysLib;
const useMultiFileAuthState = (baileysLib as any).useMultiFileAuthState || (baileysLib as any).default?.useMultiFileAuthState;
const DisconnectReason = (baileysLib as any).DisconnectReason || (baileysLib as any).default?.DisconnectReason;
const fetchLatestBaileysVersion = (baileysLib as any).fetchLatestBaileysVersion || (baileysLib as any).default?.fetchLatestBaileysVersion;
const downloadMediaMessage = (baileysLib as any).downloadMediaMessage || (baileysLib as any).default?.downloadMediaMessage;
import { GoogleGenAI } from "@google/genai";
import { generateGeminiContent } from './src/services/geminiService';
import fs from 'fs';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import { Boom } from '@hapi/boom';
import PDFDocument from 'pdfkit';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, serverTimestamp, writeBatch, FieldValue, Timestamp, getDocFromServer } from 'firebase/firestore';
import Database from 'better-sqlite3';
import { 
    generateSecureToken, 
    normalizePhone, 
    isPhoneMatch, 
    hasPermission, 
    PERMISSIONS, 
    ALL_PERMISSIONS, 
    sanitizeBotForClient, 
    rateLimiter,
    hashSecret,
    verifySecret
} from './src/security';
import { recordAuditLog, fetchAuditLogs } from './src/audit';
import { handleWhatsAppAdminMessage } from './src/whatsappController';
import { processGroupModeration, getGroupConfig, getGroupMeta, recordGroupLog, isBotParticipantAdmin, clearGroupMetaCache } from './src/services/groupModeration';
import { resolveOwnWhatsAppIdentity, isSelfIdentity, findBotParticipant, checkIsMentionedOrReply, syncBotGroups } from './src/services/whatsappIdentity';
import { initBotGroupSchedulers, clearBotSchedulers, scheduleGroupMotivation, sendDailyMotivationToGroup } from './src/services/groupScheduler';
import { GroupConfig } from './src/types';
import { 
    resolveMessageDestination, 
    sendBotMessage, 
    extractMediaMessage, 
    hasValidMediaKey, 
    isAllowedDestination,
    registerActiveSock
} from './src/services/whatsappPipeline';

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

const app = express();
app.use(express.json());
app.use(rateLimiter(150, 60000));

// Firebase Setup
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function testConnection() {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    console.log("Conexão com Firestore estabelecida com sucesso.");
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Erro de conexão: O cliente está offline. Verifique a configuração do Firebase.");
    }
  }
}
testConnection();

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

type OperationType = typeof OperationType[keyof typeof OperationType];

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: undefined, // No user on server-side usually
      email: undefined,
      emailVerified: undefined,
      isAnonymous: undefined,
      tenantId: undefined,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Migration Logic
async function migrateIfNeeded() {
    const dbPath = path.join(process.cwd(), 'bot_data.db');
    if (fs.existsSync(dbPath)) {
        console.log("[Migration] SQLite detectado. Iniciando migração para Firestore...");
        try {
            const sqliteDb = new Database(dbPath);
            const bots = sqliteDb.prepare('SELECT * FROM bots').all() as any[];
            
            for (const bot of bots) {
                const botRef = doc(firestoreDb, 'bots', bot.id);
                let botSnap;
                try {
                    botSnap = await getDoc(botRef);
                } catch (e) {
                    handleFirestoreError(e, OperationType.GET, `bots/${bot.id}`);
                }
                if (!botSnap.exists()) {
                    console.log(`[Migration] Migrando bot: ${bot.name} (${bot.id})`);
                    try {
                        await setDoc(botRef, {
                            ...bot,
                            createdAt: serverTimestamp()
                        });
                    } catch (e) {
                        handleFirestoreError(e, OperationType.WRITE, `bots/${bot.id}`);
                    }
                    
                    // Migrate history
                    const history = sqliteDb.prepare('SELECT * FROM history WHERE botId = ?').all(bot.id) as any[];
                    const batch = writeBatch(firestoreDb);
                    for (const h of history) {
                        const hRef = doc(collection(botRef, 'history'));
                        batch.set(hRef, {
                            ...h,
                            timestamp: serverTimestamp()
                        });
                    }
                    try {
                        await batch.commit();
                    } catch (e) {
                        handleFirestoreError(e, OperationType.WRITE, `bots/${bot.id}/history (batch)`);
                    }
                }
            }
            sqliteDb.close();
            // Rename file to avoid re-migration
            fs.renameSync(dbPath, dbPath + '.migrated');
            console.log("[Migration] Migração concluída com sucesso!");
        } catch (e) {
            console.error("[Migration] Erro durante a migração:", e);
        }
    }
}
migrateIfNeeded();

async function saveMessage(botId: string, jid: string, role: 'user' | 'model', text: string) {
    const botRef = doc(firestoreDb, 'bots', botId);
    const historyRef = collection(botRef, 'history');
    try {
        await addDoc(historyRef, {
            botId,
            jid,
            role,
            text,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `bots/${botId}/history`);
    }
    
    // Keep only last 20 messages per user
    const q = query(
        historyRef,
        where('jid', '==', jid),
        orderBy('timestamp', 'desc'),
        limit(100) // Get more to find the offset
    );
    
    let snapshot;
    try {
        snapshot = await getDocs(q);
    } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `bots/${botId}/history`);
    }
    
    if (snapshot && snapshot.docs.length > 20) {
        const batch = writeBatch(firestoreDb);
        snapshot.docs.slice(20).forEach(doc => batch.delete(doc.ref));
        try {
            await batch.commit();
        } catch (e) {
            handleFirestoreError(e, OperationType.DELETE, `bots/${botId}/history (cleanup)`);
        }
    }
}

async function getHistory(botId: string, jid: string) {
    const botRef = doc(firestoreDb, 'bots', botId);
    const historyRef = collection(botRef, 'history');
    const q = query(
        historyRef,
        where('jid', '==', jid),
        orderBy('timestamp', 'asc')
    );
    
    let snapshot;
    try {
        snapshot = await getDocs(q);
    } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `bots/${botId}/history`);
    }
    
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            role: data.role,
            parts: [{ text: data.text }]
        };
    });
}

async function createPDF(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        
        // Add content to PDF
        doc.fontSize(12).text(text, {
            align: 'left',
            lineGap: 2
        });
        
        doc.end();
    });
}

// Multi-Bot Management
const activeSocks = new Map<string, any>();
const qrCodes = new Map<string, string>();
const connectionStatuses = new Map<string, string>();

function getGenAIInstances(keysStr: string) {
    let keys = keysStr ? keysStr.split(',').map(k => k.trim()).filter(k => k !== "") : [];
    // Fallback to server-wide GEMINI_API_KEY environment variable if no bot-specific keys set
    if (keys.length === 0 && process.env.GEMINI_API_KEY) {
        keys = process.env.GEMINI_API_KEY.split(',').map(k => k.trim()).filter(k => k !== "");
    }
    return keys.map((k: string) => {
        const cleanKey = k.trim().replace(/["']/g, '');
        return cleanKey ? new GoogleGenAI({ apiKey: cleanKey }) : null;
    }).filter(ai => ai !== null);
}

const currentKeyIndexes = new Map<string, number>();

const startingBots = new Set<string>();
const botReconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();

// Safe Message Sending Wrapper with Connection Verification and Audit Logging
async function safeSendMessage(
    botId: string, 
    jid: string, 
    content: any, 
    options?: any,
    context?: any
): Promise<boolean> {
    return sendBotMessage(
        {
            botId,
            destinationJid: jid,
            content,
            options,
            context
        },
        firestoreDb,
        (id) => activeSocks.get(id),
        (id) => connectionStatuses.get(id)
    );
}

// Global Process Crash Prevention & Audit
process.on('uncaughtException', (err) => {
    console.error('[CRASH PREVENTION] Uncaught Exception:', err);
    try {
        recordAuditLog(firestoreDb, {
            botId: 'system',
            action: 'UNCAUGHT_EXCEPTION',
            result: 'ERROR',
            details: err.message || 'Exceção não tratada capturada',
            stack: err.stack
        });
    } catch (e) {}
});

process.on('unhandledRejection', (reason: any) => {
    console.error('[CRASH PREVENTION] Unhandled Rejection:', reason);
    try {
        recordAuditLog(firestoreDb, {
            botId: 'system',
            action: 'UNHANDLED_REJECTION',
            result: 'ERROR',
            details: typeof reason === 'object' ? (reason?.message || JSON.stringify(reason)) : String(reason),
            stack: reason?.stack
        });
    } catch (e) {}
});

async function resetBotSession(botId: string) {
    console.log(`[Bot ${botId}] Resetando sessão WhatsApp e gerando novo QR...`);
    botReconnectAttempts.delete(botId);
    if (reconnectTimers.has(botId)) {
        clearTimeout(reconnectTimers.get(botId));
        reconnectTimers.delete(botId);
    }
    if (activeSocks.has(botId)) {
        try {
            const sock = activeSocks.get(botId);
            sock.ev.removeAllListeners('connection.update');
            sock.end(undefined);
        } catch(e) {}
        activeSocks.delete(botId);
        registerActiveSock(botId, null);
    }
    const authPath = path.join(process.cwd(), 'auth_info', `bot_${botId}`);
    if (fs.existsSync(authPath)) {
        try {
            fs.rmSync(authPath, { recursive: true, force: true });
        } catch(e) {
            console.error(`[Bot ${botId}] Erro ao limpar auth_info:`, e);
        }
    }
    startingBots.delete(botId);
    qrCodes.delete(botId);
    connectionStatuses.set(botId, "Reiniciando...");
    await startBot(botId);
}

async function startBot(botId: string) {
    if (startingBots.has(botId)) {
        console.log(`[Bot ${botId}] Já está iniciando, ignorando nova chamada (lock ativo).`);
        return;
    }

    // Re-verify if bot still exists and is active in DB before starting
    try {
        const checkDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        if (!checkDoc.exists() || !checkDoc.data()?.active) {
            console.log(`[Bot ${botId}] [BOT_DELETED_OR_INACTIVE] Bot não encontrado ou inativo no Firestore. Abortando startBot.`);
            startingBots.delete(botId);
            return;
        }
    } catch (e) {
        console.error(`[Bot ${botId}] Erro ao validar bot no Firestore:`, e);
        startingBots.delete(botId);
        return;
    }

    startingBots.add(botId);
    console.log(`[Bot ${botId}] [BOT_START] Iniciando bot...`);

    try {
        const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        const bot = botDoc.data();
        if (!bot || !bot.active) {
            console.log(`[Bot ${botId}] Bot inativo ou não encontrado.`);
            startingBots.delete(botId);
            return;
        }

        if (activeSocks.has(botId)) {
            console.log(`[Bot ${botId}] Fechando conexão anterior existente...`);
            try { 
                const oldSock = activeSocks.get(botId);
                oldSock.ev.removeAllListeners('connection.update');
                oldSock.end(undefined); 
            } catch(e) {}
            activeSocks.delete(botId);
        }

        const authPath = path.join(process.cwd(), 'auth_info', `bot_${botId}`);
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        console.log(`[Bot ${botId}] Carregando estado de autenticação...`);
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        
        console.log(`[Bot ${botId}] Buscando versão do Baileys...`);
        const { version } = await fetchLatestBaileysVersion();

        console.log(`[Bot ${botId}] [SOCKET_CREATED] Criando socket do Baileys...`);
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: [bot.name || "TechStar Bot", "Chrome", "1.0.0"],
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 15000,
            generateHighQualityLinkPreview: false,
        });

        activeSocks.set(botId, sock);
        registerActiveSock(botId, sock);
        connectionStatuses.set(botId, "Conectando...");

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log(`[Bot ${botId}] [QR_RECEIVED] QR Code recebido do Baileys. Convertendo para DataURL...`);
                connectionStatuses.set(botId, "QR_READY");
                qrcode.toDataURL(qr, (err, url) => {
                    if (err) {
                        console.error(`[Bot ${botId}] Erro ao converter QR para DataURL:`, err);
                    } else {
                        console.log(`[Bot ${botId}] QR Code convertido para DataURL com sucesso. Tamanho: ${url.length}`);
                        qrCodes.set(botId, url || "");
                    }
                });
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const errMessage = lastDisconnect?.error?.message || '';
                console.log(`[Bot ${botId}] [CONNECTION_CLOSE] Conexão fechada. Código: ${statusCode} (Razão: ${errMessage})`);
                
                qrCodes.delete(botId);
                activeSocks.delete(botId);
                registerActiveSock(botId, null);
                
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const isQrExpired = statusCode === 408 || errMessage.includes('QR refs') || errMessage.includes('timedOut') || errMessage.includes('Connection Timeout');
                const isRegistered = !!state.creds?.registered;

                // Re-check if bot is still active in DB before reconnecting
                const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
                const currentBot = botDoc.data();
                if (!currentBot || !currentBot.active) {
                    console.log(`[Bot ${botId}] Bot desativado ou apagado no banco, não irá reconectar.`);
                    startingBots.delete(botId);
                    return;
                }

                if (isLoggedOut) {
                    console.log(`[Bot ${botId}] [LOGGED_OUT] Sessão invalidada/deslogada pelo usuário ou WhatsApp. Limpando credenciais...`);
                    const authPath = path.join(process.cwd(), 'auth_info', `bot_${botId}`);
                    if (fs.existsSync(authPath)) {
                        try { fs.rmSync(authPath, { recursive: true, force: true }); } catch {}
                    }
                    connectionStatuses.set(botId, "Deslogado");
                    startingBots.delete(botId);
                    botReconnectAttempts.delete(botId);
                    clearBotSchedulers(botId);
                } else if (isQrExpired && !isRegistered) {
                    // QR expired without scan and never authenticated before
                    console.log(`[Bot ${botId}] [QR_EXPIRED] QR Code expirado (Código 408 / QR refs attempts ended) sem autenticação prévia. Parando reconexão automática.`);
                    connectionStatuses.set(botId, "QR_EXPIRED");
                    startingBots.delete(botId);
                    botReconnectAttempts.delete(botId);
                } else {
                    // Reconnection allowed only for previously authenticated bots or network drops after open
                    connectionStatuses.set(botId, "Reconectando...");
                    const attempts = (botReconnectAttempts.get(botId) || 0) + 1;
                    botReconnectAttempts.set(botId, attempts);
                    const delay = Math.min(60000, 5000 * Math.pow(1.5, attempts - 1));

                    console.log(`[Bot ${botId}] [RECONNECT_SCHEDULED] Tentativa #${attempts} de reconexão em ${Math.round(delay/1000)}s...`);
                    
                    if (reconnectTimers.has(botId)) {
                        clearTimeout(reconnectTimers.get(botId));
                    }

                    const timer = setTimeout(async () => {
                        reconnectTimers.delete(botId);
                        startingBots.delete(botId);

                        // Double check active status before starting
                        try {
                            const checkDoc = await getDoc(doc(firestoreDb, 'bots', botId));
                            if (!checkDoc.exists() || !checkDoc.data()?.active) {
                                console.log(`[Bot ${botId}] [RECONNECT_CANCELLED] Bot foi apagado ou desativado durante espera.`);
                                return;
                            }
                        } catch (e) {
                            return;
                        }

                        console.log(`[Bot ${botId}] [RECONNECT_STARTED] Iniciando reconexão agendada...`);
                        startBot(botId);
                    }, delay);

                    reconnectTimers.set(botId, timer);
                }
            } else if (connection === 'open') {
                console.log(`[Bot ${botId}] [CONNECTION_OPEN] Conexão estabelecida com sucesso!`);
                connectionStatuses.set(botId, "Conectado");
                qrCodes.delete(botId);
                startingBots.delete(botId);
                botReconnectAttempts.set(botId, 0); // Reset attempts on successful connection
                if (reconnectTimers.has(botId)) {
                    clearTimeout(reconnectTimers.get(botId));
                    reconnectTimers.delete(botId);
                }

                // Sincronização automática e precisa dos grupos onde o bot participa/é admin
                syncBotGroups(botId, sock, firestoreDb, bot).catch(err => 
                    console.error(`[Bot ${botId}] Erro ao sincronizar grupos na conexão:`, err)
                );

                // Inicializa agendamentos diários dos grupos
                initBotGroupSchedulers({
                    botId,
                    getActiveSock: (id) => activeSocks.get(id),
                    firestoreDb,
                    geminiKeys: bot.geminiKeys
                }).catch(err => console.error(`[Bot ${botId}] Erro ao inicializar agendamentos de grupo:`, err));
            }
        });

    sock.ev.on('group-participants.update', async (anu: any) => {
        console.log(`[Bot ${botId}] Evento group-participants.update recebido:`, anu.action, anu.id);
        const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        const currentBot = botDoc.data();
        if (!currentBot || !currentBot.active) {
            console.log(`[Bot ${botId}] Bot inativo ou não encontrado, ignorando evento de grupo.`);
            return;
        }

        const { id, participants, action } = anu;

        // Atualiza metadata em tempo real e sincroniza se o privilégio de admin mudou
        const meta = await getGroupMeta(sock, id, true);
        if (meta) {
            try {
                const groupRef = doc(firestoreDb, 'bots', botId, 'groups', id);
                await setDoc(groupRef, {
                    botId,
                    groupId: id,
                    groupName: meta.subject || 'Grupo WhatsApp',
                    groupDesc: meta.desc || '',
                    participantCount: meta.size,
                    botIsAdmin: meta.botIsAdmin,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                console.log(`[Bot ${botId}] Status do bot no grupo ${id} sincronizado: botIsAdmin=${meta.botIsAdmin}, acao=${action}`);
            } catch (snapErr) {
                console.error(`[Bot ${botId}] Erro ao atualizar status de admin no Firestore:`, snapErr);
            }
        }

        const groupConfig = await getGroupConfig(firestoreDb, botId, id);
        
        const shouldWelcome = groupConfig.welcomeEnabled ?? currentBot.groupWelcomeEnabled;
        if (action === 'add' && shouldWelcome) {
            console.log(`[Bot ${botId}] Processando entrada de participantes no grupo ${id}. Total: ${participants.length}`);
            for (const participant of participants) {
                const jid = typeof participant === 'string' ? participant : (participant.jid || participant.id);
                if (!jid || typeof jid !== 'string') continue;

                const norm = jid.split('@')[0];
                const rawTemplate = groupConfig.welcomeMessage || currentBot.groupWelcomeMsg || `Olá @user! Seja bem-vindo(a) ao grupo!`;
                const finalMsg = rawTemplate.replace(/@user/g, `@${norm}`);

                try {
                    await safeSendMessage(botId, id, { 
                        text: finalMsg, 
                        mentions: [jid] 
                    }, undefined, { actionName: 'GROUP_WELCOME', chatType: 'GROUP' });
                } catch (err) {
                    console.error(`[Bot ${botId}] Erro ao enviar boas-vindas:`, err);
                }
            }
        } else if (action === 'remove' && (groupConfig.exitEnabled ?? currentBot.groupExitEnabled)) {
            console.log(`[Bot ${botId}] Processando saída de participantes no grupo ${id}. Total: ${participants.length}`);
            for (const participant of participants) {
                const jid = typeof participant === 'string' ? participant : (participant.jid || participant.id);
                if (!jid || typeof jid !== 'string') continue;
                
                const norm = jid.split('@')[0];
                const rawTemplate = groupConfig.exitMessage || currentBot.groupExitMsg || `@user saiu do grupo.`;
                const finalMsg = rawTemplate.replace(/@user/g, `@${norm}`);
                try {
                    await safeSendMessage(botId, id, { text: finalMsg }, undefined, { actionName: 'GROUP_EXIT', chatType: 'GROUP' });
                } catch (err) {
                    console.error(`[Bot ${botId}] Erro ao enviar mensagem de saída:`, err);
                }
            }
        }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
        if (!m.messages || !Array.isArray(m.messages)) return;

        for (const msg of m.messages) {
            try {
                if (!msg || !msg.message) continue;

                // 1. Resolução centralizada do destino da mensagem e classificação do tipo de chat
                const resolved = await resolveMessageDestination(msg, botId, sock);
                const { chatType, destinationJid, senderJid, remoteJid, participantJid, canReply, reason, senderPn, senderLid } = resolved;

                if (!remoteJid) continue;

                // 2. Registro do log de recebimento de mensagem
                await recordAuditLog(firestoreDb, {
                    botId,
                    action: 'MESSAGE_RECEIVED',
                    result: 'SUCCESS',
                    chatId: remoteJid,
                    remoteJid,
                    senderJid,
                    chatType,
                    messageId: msg.key?.id || undefined,
                    details: `Mensagem recebida em chat do tipo ${chatType}`
                });

                // 3. Registro do log de resolução de destino
                await recordAuditLog(firestoreDb, {
                    botId,
                    action: 'MESSAGE_DESTINATION_RESOLVED',
                    result: canReply ? 'SUCCESS' : 'SKIPPED',
                    chatId: remoteJid,
                    remoteJid,
                    senderJid,
                    destinationJid: destinationJid || undefined,
                    chatType,
                    messageId: msg.key?.id || undefined,
                    details: canReply ? `Destino resolvido para ${destinationJid}` : (reason || 'Destino não suporta respostas automáticas')
                });

                // 4. Tratamento específico para Canais / Newsletters: Somente leitura, nunca responder
                if (chatType === 'NEWSLETTER') {
                    await recordAuditLog(firestoreDb, {
                        botId,
                        action: 'NEWSLETTER_MESSAGE_IGNORED',
                        result: 'IGNORED',
                        chatId: remoteJid,
                        remoteJid,
                        senderJid,
                        chatType: 'NEWSLETTER',
                        messageId: msg.key?.id || undefined,
                        details: 'Mensagem de canal/newsletter ignorada para resposta'
                    });
                    continue;
                }

                // 5. Tratamento para Broadcast / Status
                if (chatType === 'BROADCAST') {
                    continue;
                }

                // 6. Se o destino não puder receber respostas (ex: LID sem mapeamento ou inválido)
                if (!canReply || !destinationJid) {
                    if (chatType === 'LID') {
                        await recordAuditLog(firestoreDb, {
                            botId,
                            action: 'JID_RESOLUTION_FAILED',
                            result: 'ERROR',
                            chatId: remoteJid,
                            remoteJid,
                            senderJid,
                            chatType: 'LID',
                            messageId: msg.key?.id || undefined,
                            details: reason || 'Falha ao resolver JID de LID para resposta'
                        });
                    }
                    continue;
                }

                // Para grupos (@g.us), destinationJid é SEMPRE o grupo (remoteJid) e NÃO o participant!
                const isGroup = chatType === 'GROUP';
                const targetChatJid = destinationJid;

                const messageType = Object.keys(msg.message)[0];
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.documentMessage?.caption || "";
                const cleanText = (text || '').trim();

                // Reload bot config for each message
                const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
                const currentBot = botDoc.data();
                if (!currentBot || !currentBot.active) continue;

                const identity = await resolveOwnWhatsAppIdentity(sock, currentBot, botId, firestoreDb);
                const isFromSelf = !!msg.key.fromMe || isSelfIdentity(senderJid, identity, sock);

                // If message is fromMe (sent by bot or from phone app using bot number)
                if (isFromSelf) {
                    if (cleanText.startsWith('/') || cleanText.startsWith('!')) {
                        // Allow owner slash commands sent directly from WhatsApp on phone
                    } else {
                        // Ignore general self messages to prevent loops
                        if (isGroup) {
                            console.log('[GROUP_MESSAGE_SKIPPED]', { botId, groupId: remoteJid, reason: 'MESSAGE_FROM_SELF' });
                        }
                        continue;
                    }
                }

                // Check group meta & status for logs
                const meta = isGroup ? await getGroupMeta(sock, remoteJid, false, currentBot, botId) : null;
                const { isMentioned, isReplyToBot } = checkIsMentionedOrReply({
                    messageObj: msg.message,
                    rawText: text,
                    identity,
                    sock
                });

                if (isGroup) {
                    console.log('[GROUP_MESSAGE_RECEIVED]', {
                        botId,
                        messageId: msg.key?.id,
                        remoteJid,
                        participant: participantJid || senderJid,
                        chatType,
                        isGroup: true,
                        respondInGroups: currentBot.respondInGroups !== false && currentBot.respondInGroups !== 0,
                        isBotAdmin: !!(meta?.botIsAdmin),
                        isMentioned,
                        isReplyToBot
                    });
                }

                // Intercept administrative commands and owner management intents via WhatsApp
                const adminResult = await handleWhatsAppAdminMessage({
                    sock,
                    botId,
                    currentBot,
                    senderJid,
                    groupId: isGroup ? remoteJid : undefined,
                    destinationJid: targetChatJid,
                    senderPn,
                    senderLid,
                    fromMe: isFromSelf,
                    text: cleanText,
                    messageObj: msg.message,
                    firestoreDb,
                    isGroup,
                    sendBotMessage: (sendOpts) => safeSendMessage(sendOpts.botId, sendOpts.destinationJid, sendOpts.content, sendOpts.options, sendOpts.context),
                    onResetBot: async (targetBotId: string) => {
                        await resetBotSession(targetBotId);
                    }
                });

                if (adminResult.handled) {
                    continue;
                }

                // Executa Moderação Determinística em Grupos
                if (isGroup) {
                    const modResult = await processGroupModeration({
                        sock,
                        botId,
                        currentBot,
                        groupId: remoteJid,
                        senderJid,
                        messageKey: msg.key,
                        rawText: text,
                        messageObj: msg.message,
                        firestoreDb
                    });

                    if (modResult.blocked || !modResult.shouldProceedToAI) {
                        continue;
                    }
                }

                // Check for media
                const mediaInfo = extractMediaMessage(msg.message);
                const isImage = messageType === 'imageMessage' || mediaInfo?.mediaType === 'image';
                const isDocument = messageType === 'documentMessage' || mediaInfo?.mediaType === 'document';
                const isPdf = isDocument && (msg.message.documentMessage?.mimetype === 'application/pdf' || (mediaInfo?.mediaObj as any)?.mimetype === 'application/pdf');

                if ((isImage || isPdf) && !currentBot.analysisEnabled) {
                    if (isGroup) console.log('[GROUP_MESSAGE_SKIPPED]', { botId, groupId: remoteJid, reason: 'MEDIA_ANALYSIS_DISABLED' });
                    continue;
                }
                if (!cleanText && !isImage && !isPdf) {
                    if (isGroup) console.log('[GROUP_MESSAGE_SKIPPED]', { botId, groupId: remoteJid, reason: 'EMPTY_TEXT_AND_NO_MEDIA' });
                    continue;
                }

                if (!isGroup && !currentBot.respondInPrivate) continue;

                // Handle private exit command
                if (!isGroup && cleanText.toLowerCase() === '!sair' && currentBot.privateExitEnabled) {
                    await safeSendMessage(botId, targetChatJid, { text: currentBot.exitMsg || "Até logo!" });
                    continue;
                }

                if (isGroup) {
                    console.log('[GROUP_MESSAGE_PROCESSING]', {
                        botId,
                        groupId: remoteJid,
                        textLength: cleanText.length
                    });
                }

                const geminiKeysConfig = currentBot.geminiKeys || currentBot.geminiKey || process.env.GEMINI_API_KEY || "";
                if (!geminiKeysConfig.trim()) {
                    console.warn(`[Bot ${botId}] Nenhuma chave Gemini configurada. Atendimento AI suspenso.`);
                    await recordAuditLog(firestoreDb, {
                        botId,
                        action: 'AI_UNAVAILABLE',
                        result: 'ERROR',
                        chatId: targetChatJid,
                        details: 'Nenhuma chave Gemini disponível'
                    });
                    continue;
                }

                const history = currentBot.memoryEnabled ? await getHistory(botId, targetChatJid) : [];
                
                // Handle private welcome message (first contact)
                if (!isGroup && history.length === 0 && currentBot.privateWelcomeEnabled) {
                    await safeSendMessage(botId, targetChatJid, { text: currentBot.welcomeMsg || "Olá! Como posso ajudar?" });
                }

                const parts: any[] = [];
                if (cleanText) parts.push({ text: cleanText });

                if ((isImage || isPdf) && currentBot.analysisEnabled) {
                    // Validação de mediaKey antes da chamada Baileys downloadMediaMessage
                    const validKey = hasValidMediaKey(mediaInfo?.mediaObj);

                    if (!validKey) {
                        console.warn(`[Bot ${botId}] Mídia recebida sem mediaKey válida de ${senderJid}. Download suspenso.`);
                        await recordAuditLog(firestoreDb, {
                            botId,
                            action: 'MEDIA_DOWNLOAD_SKIPPED',
                            result: 'SKIPPED',
                            chatId: targetChatJid,
                            remoteJid,
                            senderJid,
                            chatType,
                            mediaType: mediaInfo?.mediaType || (isImage ? 'image' : 'pdf'),
                            messageId: msg.key?.id || undefined,
                            details: 'Mídia sem mediaKey válida ou chave expirada no WhatsApp. Download suspenso com segurança.'
                        });
                    } else {
                        try {
                            console.log(`[Bot ${botId}] Baixando mídia para análise...`);
                            const buffer = await downloadMediaMessage(msg, 'buffer', {});
                            const mimeType = isImage ? 'image/jpeg' : 'application/pdf';
                            parts.push({
                                inlineData: {
                                    data: buffer.toString('base64'),
                                    mimeType
                                }
                            });
                            if (currentBot.analysisInstructions) {
                                parts.push({ text: `\n\nINSTRUÇÕES DE ANÁLISE:\n${currentBot.analysisInstructions}` });
                            }
                        } catch (mediaErr: any) {
                            console.error(`[Bot ${botId}] Erro ao baixar/descriptografar mídia:`, mediaErr);
                            await recordAuditLog(firestoreDb, {
                                botId,
                                action: 'MEDIA_PROCESSING_FAILED',
                                result: 'ERROR',
                                chatId: targetChatJid,
                                remoteJid,
                                senderJid,
                                chatType,
                                mediaType: mediaInfo?.mediaType || (isImage ? 'image' : 'pdf'),
                                messageId: msg.key?.id || undefined,
                                errorCode: 'MEDIA_DOWNLOAD_ERROR',
                                errorName: mediaErr.name || 'MediaDownloadError',
                                errorMessage: mediaErr.message || String(mediaErr),
                                details: `Falha ao processar arquivo de mídia: ${mediaErr.message || 'chave inválida ou download corrompido'}`
                            });
                        }
                    }
                }

                // Se era apenas mensagem de mídia e a mídia foi ignorada/falhou, não envia prompt vazio para IA
                if (parts.length === 0) {
                    continue;
                }

                await saveMessage(botId, targetChatJid, 'user', cleanText || "[Mídia enviada]");

                const isOwner = currentBot.ownerNumber && (targetChatJid.includes(currentBot.ownerNumber) || senderJid.includes(currentBot.ownerNumber));
                let ownerInstruction = "";
                if (isOwner) {
                    ownerInstruction = `\n\nVOCÊ ESTÁ FALANDO COM SEU PROPRIETÁRIO: ${currentBot.ownerName || 'Proprietário'}. Ele tem permissão total. Se ele pedir relatórios, resumos ou informações sobre o sistema, forneça-os de forma clara e detalhada.`;
                }

                const pdfInstruction = "\n\nSe o usuário solicitar um PDF ou se você achar que a resposta deve ser um documento formal, escreva o conteúdo que deve ir no PDF entre as tags <pdf> e </pdf>. O sistema converterá automaticamente esse conteúdo em um arquivo PDF e enviará ao usuário.";
                const fullSystemPrompt = `${currentBot.systemPrompt || ''}${ownerInstruction}${pdfInstruction}\n\nBASE DE CONHECIMENTO:\n${currentBot.knowledgeBase || "Nenhuma"}`;
                
                // Centralized and resilient Gemini generation with multi-key rotation, 404 fallback, and 503 backoff
                const geminiResult = await generateGeminiContent({
                    botId,
                    geminiKeysStr: currentBot.geminiKey,
                    history,
                    userParts: parts,
                    systemInstruction: fullSystemPrompt,
                    firestoreDb
                });

                const responseText = geminiResult.text;
                if (responseText) {
                    await saveMessage(botId, targetChatJid, 'model', responseText);
                    
                    const pdfMatch = responseText.match(/<pdf>([\s\S]*?)<\/pdf>/i);
                    
                    if (pdfMatch) {
                        try {
                            const pdfContent = pdfMatch[1].trim();
                            const pdfBuffer = await createPDF(pdfContent);
                            const cleanTextOutsidePdf = responseText.replace(/<pdf>[\s\S]*?<\/pdf>/gi, '').trim();
                            
                            if (cleanTextOutsidePdf) {
                                await safeSendMessage(botId, targetChatJid, { text: cleanTextOutsidePdf });
                            }
                            
                            await safeSendMessage(botId, targetChatJid, { 
                                document: pdfBuffer, 
                                mimetype: 'application/pdf', 
                                fileName: 'documento.pdf',
                                caption: 'Aqui está o seu PDF solicitado!'
                            });
                        } catch (pdfErr: any) {
                            console.error(`[Bot ${botId}] Erro ao gerar PDF:`, pdfErr);
                            await safeSendMessage(botId, targetChatJid, { text: responseText });
                        }
                    } else {
                        await safeSendMessage(botId, targetChatJid, { text: responseText });
                    }

                    if (isGroup) {
                        console.log('[GROUP_REPLY_SENT]', {
                            botId,
                            destinationJid: targetChatJid,
                            messageId: msg.key?.id
                        });
                    }
                }
            } catch (e: any) {
                console.error(`Erro no Bot ${botId} ao processar mensagem:`, e);
                await recordAuditLog(firestoreDb, {
                    botId,
                    action: 'MESSAGE_PROCESSING_ERROR',
                    result: 'ERROR',
                    details: e.message || 'Erro ao processar mensagem recebida',
                    stack: e.stack
                });
            }
        }
    });
    } catch (e) {
        console.error(`[Bot ${botId}] Erro fatal ao iniciar:`, e);
        startingBots.delete(botId);
    }
}

// Authentication & Multi-Tenant Authorization Middleware
async function requireBotAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const botId = req.params.id;
    if (!botId) return res.status(400).json({ error: "botId obrigatório" });

    // Internal admin authorization header or query
    const adminKey = req.headers['x-admin-key'] as string;
    const isAdmin = adminKey === (process.env.ADMIN_KEY || 'techstar_master_2024') || 
                    req.headers['x-requested-by'] === 'techstar-admin';

    // Client token from Query (?token=...), Header (x-bot-token), or Bearer Authorization
    const token = (req.query.token as string) || 
                  (req.headers['x-bot-token'] as string) || 
                  (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '');

    try {
        const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        const bot = botDoc.data();
        if (!bot) return res.status(404).json({ error: "Bot não encontrado" });

        // Auto-assign accessToken if not present
        if (!bot.accessToken) {
            bot.accessToken = generateSecureToken();
            await updateDoc(doc(firestoreDb, 'bots', botId), { accessToken: bot.accessToken });
        }

        if (isAdmin) {
            (req as any).bot = bot;
            (req as any).authRole = 'ADMIN';
            return next();
        }

        // Multi-Tenant IDOR validation:
        // Must provide token and token must match this specific bot's accessToken
        if (!token || token !== bot.accessToken) {
            await recordAuditLog(firestoreDb, {
                botId,
                role: 'USER',
                action: 'UNAUTHORIZED_API_ACCESS',
                command: `${req.method} ${req.originalUrl}`,
                result: 'DENIED',
                details: `Tentativa de acesso não autorizada: ${token ? 'TOKEN_INVALIDO' : 'SEM_TOKEN'}`
            });
            return res.status(403).json({
                error: "403 Forbidden: Acesso negado. Token de autorização inválido ou ausente para esta instância."
            });
        }

        (req as any).bot = bot;
        (req as any).authRole = 'OWNER';
        next();
    } catch (e: any) {
        console.error(`Erro na autenticação do bot ${botId}:`, e);
        res.status(500).json({ error: "Erro interno de autorização" });
    }
}

// Initialize Admin Settings default password '123456' if not exists
async function ensureAdminSettings() {
    try {
        const ref = doc(firestoreDb, 'adminSettings', 'general');
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            const defaultPasswordHash = hashSecret('123456');
            await setDoc(ref, {
                passwordHash: defaultPasswordHash,
                isCustom: false,
                createdAt: serverTimestamp()
            });
            console.log("[Admin] Configuração de admin padrão inicializada com sucesso.");
        }
    } catch (e) {
        console.error("[Admin] Erro ao assegurar config de admin:", e);
    }
}
ensureAdminSettings();

// Persistent Rate Limiter & Security Validation Helpers
const WEAK_PINS = ['0000', '1111', '1234', '123456', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1122', '1212'];

function isWeakPin(pin: string): boolean {
    if (!pin || pin.length < 4 || pin.length > 6) return true;
    if (WEAK_PINS.includes(pin)) return true;
    if (/^(\d)\1+$/.test(pin)) return true;
    return false;
}

async function checkAndRecordAttempt(key: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const now = Date.now();
    const safeKey = key.replace(/[/.]/g, '_');
    const ref = doc(firestoreDb, 'rateLimits', safeKey);
    try {
        const snap = await getDoc(ref);
        let data = snap.exists() ? snap.data() : { attempts: 0, resetTime: now + windowMs, lockedUntil: 0 };

        if (now < data.lockedUntil) {
            const retryAfterSeconds = Math.ceil((data.lockedUntil - now) / 1000);
            return { allowed: false, retryAfterSeconds };
        }

        if (now > data.resetTime) {
            data = { attempts: 1, resetTime: now + windowMs, lockedUntil: 0 };
            await setDoc(ref, data);
            return { allowed: true };
        }

        data.attempts += 1;
        if (data.attempts > maxAttempts) {
            data.lockedUntil = now + windowMs;
            await setDoc(ref, data);
            const retryAfterSeconds = Math.ceil((data.lockedUntil - now) / 1000);
            return { allowed: false, retryAfterSeconds };
        }

        await setDoc(ref, data);
        return { allowed: true };
    } catch (e) {
        return { allowed: true };
    }
}

async function resetAttempts(key: string) {
    try {
        const safeKey = key.replace(/[/.]/g, '_');
        const ref = doc(firestoreDb, 'rateLimits', safeKey);
        await setDoc(ref, { attempts: 0, resetTime: 0, lockedUntil: 0 });
    } catch {}
}

// API Routes for Multi-Bot & Authentication with Strict Security Limits
app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: "Chave de acesso obrigatória" });

        const clientIp = req.ip || req.socket.remoteAddress || 'ip_unknown';
        const rateKey = `admin_login_${clientIp}`;
        const limitCheck = await checkAndRecordAttempt(rateKey, 5, 15 * 60 * 1000);

        if (!limitCheck.allowed) {
            await recordAuditLog(firestoreDb, {
                botId: 'global',
                role: 'ADMIN',
                action: 'LOGIN_BLOCKED',
                result: 'DENIED',
                details: `Muitas tentativas falhadas no Admin. Bloqueado por ${limitCheck.retryAfterSeconds}s`
            });
            res.setHeader('Retry-After', limitCheck.retryAfterSeconds || 900);
            return res.status(429).json({ error: `Muitas tentativas falhadas. Conta temporariamente bloqueada por 15 minutos.` });
        }

        const ref = doc(firestoreDb, 'adminSettings', 'general');
        const snap = await getDoc(ref);
        let valid = false;
        let isCustom = false;

        if (snap.exists()) {
            const data = snap.data();
            isCustom = !!data.isCustom;
            // If initial key '123456' has already been changed, 123456 must be immediately invalid
            if (password === '123456' && isCustom) {
                valid = false;
            } else {
                valid = verifySecret(password, data.passwordHash);
            }
        } else {
            valid = (password === '123456');
        }

        if (!valid) {
            await recordAuditLog(firestoreDb, {
                botId: 'global',
                role: 'ADMIN',
                action: 'LOGIN_FAILED',
                result: 'DENIED',
                details: 'Tentativa de login admin com chave incorreta'
            });
            return res.status(403).json({ error: "Credenciais inválidas." });
        }

        await resetAttempts(rateKey);
        const sessionToken = generateSecureToken();

        await recordAuditLog(firestoreDb, {
            botId: 'global',
            role: 'ADMIN',
            action: 'LOGIN_SUCCESS',
            result: 'SUCCESS',
            details: 'Login de Administrador Geral bem-sucedido'
        });

        res.json({ success: true, sessionToken, message: "Login realizado com sucesso" });
    } catch (e: any) {
        console.error("Erro no login admin:", e);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

app.post('/api/admin/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const ref = doc(firestoreDb, 'adminSettings', 'general');
        const snap = await getDoc(ref);
        let valid = false;
        if (snap.exists()) {
            const data = snap.data();
            if (currentPassword === '123456' && data.isCustom) {
                valid = false;
            } else {
                valid = verifySecret(currentPassword, data.passwordHash);
            }
        } else {
            valid = (currentPassword === '123456');
        }

        if (!valid) {
            return res.status(403).json({ error: "Senha atual incorreta" });
        }

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: "A nova chave deve ter pelo menos 4 caracteres" });
        }

        const newHash = hashSecret(newPassword);
        await setDoc(ref, { 
            passwordHash: newHash, 
            isCustom: true, 
            updatedAt: serverTimestamp() 
        }, { merge: true });

        await recordAuditLog(firestoreDb, {
            botId: 'global',
            role: 'ADMIN',
            action: 'ADMIN_KEY_CHANGED',
            result: 'SUCCESS',
            details: 'Chave de acesso do Admin alterada com sucesso'
        });

        res.json({ success: true, message: "Chave alterada com sucesso" });
    } catch (e: any) {
        console.error("Erro ao alterar chave admin:", e);
        res.status(500).json({ error: "Erro ao alterar chave" });
    }
});

app.post('/api/bot/:id/login', async (req, res) => {
    try {
        const botId = req.params.id;
        const { pin } = req.body;
        if (!pin) return res.status(400).json({ error: "PIN de acesso obrigatório" });

        const clientIp = req.ip || req.socket.remoteAddress || 'ip_unknown';
        const rateKey = `bot_login_${botId}_${clientIp}`;
        const limitCheck = await checkAndRecordAttempt(rateKey, 5, 15 * 60 * 1000);

        if (!limitCheck.allowed) {
            await recordAuditLog(firestoreDb, {
                botId,
                role: 'OWNER',
                action: 'LOGIN_BLOCKED',
                result: 'DENIED',
                details: `Muitas tentativas falhadas de PIN. Bloqueado por ${limitCheck.retryAfterSeconds}s`
            });
            res.setHeader('Retry-After', limitCheck.retryAfterSeconds || 900);
            return res.status(429).json({ error: `Muitas tentativas falhadas. Acesso temporariamente bloqueado por 15 minutos.` });
        }

        const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        if (!botDoc.exists()) return res.status(404).json({ error: "Bot não encontrado" });
        const botData = botDoc.data();

        // Check if first access is completed
        if (!botData.pinHash || !botData.firstAccessCompleted) {
            return res.json({ success: false, firstAccessRequired: true, message: "Primeiro acesso: configure seu PIN." });
        }

        const pinValid = verifySecret(pin, botData.pinHash);

        if (!pinValid) {
            await recordAuditLog(firestoreDb, {
                botId,
                role: 'OWNER',
                action: 'LOGIN_FAILED',
                result: 'DENIED',
                details: 'Tentativa de login com PIN inválido'
            });
            return res.status(403).json({ error: "PIN incorreto para este bot" });
        }

        await resetAttempts(rateKey);

        if (!botData.accessToken) {
            const newToken = generateSecureToken();
            await updateDoc(doc(firestoreDb, 'bots', botId), { accessToken: newToken });
            botData.accessToken = newToken;
        }

        await recordAuditLog(firestoreDb, {
            botId,
            role: 'OWNER',
            action: 'LOGIN_SUCCESS',
            result: 'SUCCESS',
            details: 'Login do proprietário bem-sucedido'
        });

        res.json({ success: true, accessToken: botData.accessToken, botName: botData.name });
    } catch (e: any) {
        console.error("Erro no login do bot:", e);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

app.post('/api/bot/:id/set-first-pin', async (req, res) => {
    try {
        const botId = req.params.id;
        const { pin, confirmPin } = req.body;

        if (!pin || !confirmPin) return res.status(400).json({ error: "PIN e confirmação são obrigatórios" });
        if (pin !== confirmPin) return res.status(400).json({ error: "Os PINs não coincidem" });
        if (isWeakPin(pin)) return res.status(400).json({ error: "O PIN é muito fraco ou óbvio (ex: 0000, 1234, dígitos repetidos). Escolha um PIN seguro de 4 a 6 dígitos." });

        const botRef = doc(firestoreDb, 'bots', botId);
        const botDoc = await getDoc(botRef);
        if (!botDoc.exists()) return res.status(404).json({ error: "Bot não encontrado" });

        const pinHash = hashSecret(pin);
        const accessToken = generateSecureToken();

        await updateDoc(botRef, {
            pinHash,
            firstAccessCompleted: true,
            accessToken
        });

        await recordAuditLog(firestoreDb, {
            botId,
            role: 'OWNER',
            action: 'OWNER_FIRST_ACCESS',
            result: 'SUCCESS',
            details: 'Primeiro acesso do proprietário concluído e PIN configurado com sucesso'
        });

        res.json({ success: true, accessToken, message: "PIN configurado com sucesso!" });
    } catch (e: any) {
        console.error("Erro no primeiro acesso:", e);
        res.status(500).json({ error: "Erro ao configurar primeiro acesso" });
    }
});

app.post('/api/bot/:id/forgot-pin', async (req, res) => {
    try {
        const botId = req.params.id;
        const { fullName, phone, email } = req.body;
        if (!fullName || !phone) return res.status(400).json({ error: "Nome completo e número de WhatsApp são obrigatórios" });

        const clientIp = req.ip || req.socket.remoteAddress || 'ip_unknown';
        const cleanInputPhone = normalizePhone(phone);

        // Rate limits: max 3 requests per phone in 1 hour, max 5 requests per IP in 1 hour
        const phoneRate = await checkAndRecordAttempt(`forgot_phone_${cleanInputPhone}`, 3, 60 * 60 * 1000);
        const ipRate = await checkAndRecordAttempt(`forgot_ip_${clientIp}`, 5, 60 * 60 * 1000);

        if (!phoneRate.allowed || !ipRate.allowed) {
            return res.status(429).json({ error: "Muitas solicitações de recuperação. Tente novamente mais tarde." });
        }

        const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        if (!botDoc.exists()) return res.status(404).json({ error: "Bot não encontrado" });
        const botData = botDoc.data();

        await addDoc(collection(firestoreDb, 'botAccessRequests'), {
            botId,
            botName: botData.name,
            ownerId: botData.ownerId || `owner_${botId}`,
            fullName: fullName.trim(),
            phone: cleanInputPhone,
            email: email ? email.trim() : '',
            status: 'PENDING',
            createdAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });

        await recordAuditLog(firestoreDb, {
            botId,
            role: 'USER',
            action: 'PIN_RESET_REQUESTED',
            result: 'SUCCESS',
            details: `Solicitação de recuperação de PIN criada para ${fullName}`
        });

        res.json({ 
            success: true, 
            message: "Se os dados corresponderem a um proprietário, o pedido de recuperação será processado." 
        });
    } catch (e: any) {
        console.error("Erro ao solicitar recuperação:", e);
        res.status(500).json({ error: "Erro ao processar solicitação" });
    }
});

app.get('/api/admin/recovery-requests', async (req, res) => {
    try {
        const q = query(collection(firestoreDb, 'botAccessRequests'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json(requests);
    } catch (e) {
        console.error("Erro ao listar pedidos:", e);
        res.status(500).json({ error: "Erro ao listar pedidos" });
    }
});

app.post('/api/admin/recovery-requests/:reqId/approve', async (req, res) => {
    try {
        const reqId = req.params.reqId;
        const { newPin } = req.body;
        if (!newPin || isWeakPin(newPin)) return res.status(400).json({ error: "Novo PIN inválido ou muito fraco (deve ter 4 a 6 dígitos e não ser óbvio)." });

        const reqDocRef = doc(firestoreDb, 'botAccessRequests', reqId);
        const reqDoc = await getDoc(reqDocRef);
        if (!reqDoc.exists()) return res.status(404).json({ error: "Solicitação não encontrada" });
        const reqData = reqDoc.data();

        if (reqData.status !== 'PENDING') return res.status(400).json({ error: "Solicitação já processada ou expirada" });

        const botRef = doc(firestoreDb, 'bots', reqData.botId);
        const newAccessToken = generateSecureToken();
        await updateDoc(botRef, {
            pinHash: hashSecret(newPin),
            accessToken: newAccessToken,
            firstAccessCompleted: true
        });

        await updateDoc(reqDocRef, {
            status: 'APPROVED',
            reviewedAt: serverTimestamp()
        });

        await recordAuditLog(firestoreDb, {
            botId: reqData.botId,
            role: 'ADMIN',
            action: 'PIN_RESET_APPROVED',
            result: 'SUCCESS',
            details: `PIN redefinido com sucesso pelo Admin para o bot ${reqData.botId} e sessões anteriores invalidadas`
        });

        res.json({ success: true, message: "PIN redefinido com sucesso e sessões anteriores invalidadas." });
    } catch (e: any) {
        console.error("Erro ao aprovar recuperação:", e);
        res.status(500).json({ error: "Erro ao aprovar recuperação" });
    }
});

app.post('/api/admin/recovery-requests/:reqId/reject', async (req, res) => {
    try {
        const reqId = req.params.reqId;
        const reqDocRef = doc(firestoreDb, 'botAccessRequests', reqId);
        const reqDoc = await getDoc(reqDocRef);
        if (!reqDoc.exists()) return res.status(404).json({ error: "Solicitação não encontrada" });

        await updateDoc(reqDocRef, {
            status: 'REJECTED',
            reviewedAt: serverTimestamp()
        });

        await recordAuditLog(firestoreDb, {
            botId: reqDoc.data().botId,
            role: 'ADMIN',
            action: 'PIN_RESET_REJECTED',
            result: 'SUCCESS',
            details: 'Solicitação de recuperação rejeitada pelo Admin'
        });

        res.json({ success: true, message: "Solicitação rejeitada" });
    } catch (e: any) {
        console.error("Erro ao rejeitar recuperação:", e);
        res.status(500).json({ error: "Erro ao rejeitar recuperação" });
    }
});

// API Routes for Multi-Bot
app.get('/api/admin/bots', async (req, res) => {
    try {
        const q = query(collection(firestoreDb, 'bots'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const bots = [];

        for (const d of snapshot.docs) {
            const data = d.data();
            const updates: any = {};
            if (!data.accessToken) {
                updates.accessToken = generateSecureToken();
                data.accessToken = updates.accessToken;
            }
            if (!data.ownerId) {
                updates.ownerId = `owner_${d.id}`;
                data.ownerId = updates.ownerId;
            }
            if (!data.ownerPermissions || !Array.isArray(data.ownerPermissions)) {
                updates.ownerPermissions = ALL_PERMISSIONS;
                data.ownerPermissions = ALL_PERMISSIONS;
            }
            if (!data.ownerPhone && data.ownerNumber) {
                updates.ownerPhone = normalizePhone(data.ownerNumber);
                data.ownerPhone = updates.ownerPhone;
            }
            if (Object.keys(updates).length > 0) {
                await updateDoc(d.ref, updates);
            }
            bots.push({
                ...data,
                status: connectionStatuses.get(d.id) || "Desconectado",
                hasQR: !!qrCodes.get(d.id)
            });
        }

        res.send(bots);
    } catch (e) {
        console.error("Erro ao listar bots:", e);
        res.status(500).send({ error: "Erro ao listar bots" });
    }
});

app.post('/api/admin/bots', async (req, res) => {
    try {
        const { name } = req.body;
        const id = Math.random().toString(36).substring(2, 10);
        const accessToken = generateSecureToken();
        const botData = {
            id,
            name,
            accessToken,
            systemPrompt: "Você é um assistente útil.",
            welcomeMsg: "Olá!",
            exitMsg: "Até logo!",
            geminiKeys: "",
            active: 1,
            createdAt: serverTimestamp(),
            groupWelcomeEnabled: 0,
            groupWelcomeMsg: "",
            groupExitEnabled: 0,
            groupExitMsg: "",
            respondInGroups: 1,
            respondInPrivate: 1,
            privateWelcomeEnabled: 0,
            privateExitEnabled: 0,
            memoryEnabled: 1,
            analysisEnabled: 0,
            analysisInstructions: "Analise esta imagem ou documento detalhadamente. Procure por informações relevantes e descreva o que vê.",
            ownerName: "",
            ownerNumber: "",
            ownerPhone: "",
            ownerId: `owner_${id}`,
            ownerPermissions: ALL_PERMISSIONS
        };
        
        await setDoc(doc(firestoreDb, 'bots', id), botData);

        await recordAuditLog(firestoreDb, {
            botId: id,
            role: 'ADMIN',
            action: 'BOT_CREATED',
            result: 'SUCCESS',
            details: `Bot ${name} (${id}) criado com token seguro.`
        });
        
        console.log(`[Admin] Criando e iniciando bot: ${name} (${id})`);
        startBot(id);
        
        res.send({ id, accessToken, status: "Bot criado e iniciando..." });
    } catch (e) {
        console.error("Erro ao criar bot:", e);
        res.status(500).send({ error: "Erro ao criar bot" });
    }
});

// Revoke and regenerate client token
app.post('/api/admin/bots/:id/regenerate-token', async (req, res) => {
    try {
        const botId = req.params.id;
        const botRef = doc(firestoreDb, 'bots', botId);
        const botDoc = await getDoc(botRef);
        if (!botDoc.exists()) return res.status(404).send({ error: "Bot não encontrado" });

        const newToken = generateSecureToken();
        await updateDoc(botRef, { accessToken: newToken });

        await recordAuditLog(firestoreDb, {
            botId,
            role: 'ADMIN',
            action: 'TOKEN_REGENERATED',
            result: 'SUCCESS',
            details: 'Token revogado e regenerado pelo administrador.'
        });

        res.send({ accessToken: newToken, status: "Token revogado e regenerado com sucesso!" });
    } catch (e: any) {
        console.error("Erro ao regenerar token:", e);
        res.status(500).send({ error: "Erro ao regenerar token" });
    }
});

app.post('/api/admin/bots/:id/toggle', async (req, res) => {
    try {
        const botRef = doc(firestoreDb, 'bots', req.params.id);
        const botDoc = await getDoc(botRef);
        const bot = botDoc.data();
        if (!bot) return res.status(404).send({ error: "Bot não encontrado" });
        
        const newState = bot.active ? 0 : 1;
        await updateDoc(botRef, { active: newState });
        
        if (newState) startBot(req.params.id);
        else {
            if (activeSocks.has(req.params.id)) {
                try {
                    const sock = activeSocks.get(req.params.id);
                    sock.ev.removeAllListeners('connection.update');
                    sock.end(undefined);
                } catch(e) {}
                activeSocks.delete(req.params.id);
            }
            connectionStatuses.set(req.params.id, "Desativado");
            qrCodes.delete(req.params.id);
        }

        await recordAuditLog(firestoreDb, {
            botId: req.params.id,
            role: 'ADMIN',
            action: newState ? 'BOT_ACTIVATED' : 'BOT_DEACTIVATED',
            result: 'SUCCESS'
        });

        res.send({ status: newState ? "Bot ativado" : "Bot desativado" });
    } catch (e) {
        console.error("Erro ao alternar bot:", e);
        res.status(500).send({ error: "Erro ao alternar bot" });
    }
});

// GET Bot Config (Protected against IDOR & protects secret Gemini keys)
app.get('/api/bot/:id/config', requireBotAuth, async (req, res) => {
    try {
        const bot = (req as any).bot;
        const authRole = (req as any).authRole;
        const status = connectionStatuses.get(req.params.id) || "Desconectado";
        const qr = qrCodes.get(req.params.id) || null;

        if (authRole === 'ADMIN') {
            return res.send({
                ...bot,
                status,
                qr
            });
        }

        // Return sanitized bot config for owner/client (Gemini secret keys stripped!)
        const safeBot = sanitizeBotForClient(bot, status, qr);
        res.send(safeBot);
    } catch (e) {
        console.error("Erro ao buscar config:", e);
        res.status(500).send({ error: "Erro ao buscar config" });
    }
});

// POST Bot Config (Protected against IDOR & protects secret Gemini keys)
app.post('/api/bot/:id/config', requireBotAuth, async (req, res) => {
    try {
        const currentBot = (req as any).bot;
        const authRole = (req as any).authRole;
        const { 
            name, systemPrompt, welcomeMsg, exitMsg, knowledgeBase, geminiKeys,
            groupWelcomeEnabled, groupWelcomeMsg, groupExitEnabled, groupExitMsg,
            respondInGroups, respondInPrivate, privateWelcomeEnabled, privateExitEnabled,
            memoryEnabled, analysisEnabled, analysisInstructions,
            ownerName, ownerNumber
        } = req.body;

        // Granular permission checks for non-admin callers (e.g. owners/clients using tokens)
        if (authRole !== 'ADMIN') {
            if (!hasPermission(currentBot, PERMISSIONS.BOT_CONFIG_UPDATE)) {
                return res.status(403).json({ error: 'Permissão insuficiente para alterar configurações deste bot.' });
            }
            if (memoryEnabled !== undefined && !hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
                return res.status(403).json({ error: 'Permissão insuficiente para alterar as opções de memória.' });
            }
            if (knowledgeBase !== undefined && knowledgeBase !== currentBot.knowledgeBase && !hasPermission(currentBot, PERMISSIONS.KNOWLEDGE_MANAGE)) {
                return res.status(403).json({ error: 'Permissão insuficiente para alterar a base de conhecimento.' });
            }
            if ((respondInGroups !== undefined || groupWelcomeEnabled !== undefined || groupExitEnabled !== undefined) && !hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
                return res.status(403).json({ error: 'Permissão insuficiente para alterar configurações de grupos.' });
            }
        }

        const botRef = doc(firestoreDb, 'bots', req.params.id);
        
        const updatePayload: any = {};

        if (name !== undefined) updatePayload.name = name;
        if (systemPrompt !== undefined) updatePayload.systemPrompt = systemPrompt;
        if (welcomeMsg !== undefined) updatePayload.welcomeMsg = welcomeMsg;
        if (exitMsg !== undefined) updatePayload.exitMsg = exitMsg;
        if (knowledgeBase !== undefined) updatePayload.knowledgeBase = knowledgeBase;
        if (ownerName !== undefined) updatePayload.ownerName = ownerName;
        if (req.body.ownerLid !== undefined) updatePayload.ownerLid = req.body.ownerLid;
        if (req.body.ownerJid !== undefined) updatePayload.ownerJid = req.body.ownerJid;
        if (ownerNumber !== undefined) {
            updatePayload.ownerNumber = ownerNumber;
            updatePayload.ownerPhone = normalizePhone(ownerNumber);
        }
        if (groupWelcomeEnabled !== undefined) updatePayload.groupWelcomeEnabled = groupWelcomeEnabled ? 1 : 0;
        if (groupWelcomeMsg !== undefined) updatePayload.groupWelcomeMsg = groupWelcomeMsg;
        if (groupExitEnabled !== undefined) updatePayload.groupExitEnabled = groupExitEnabled ? 1 : 0;
        if (groupExitMsg !== undefined) updatePayload.groupExitMsg = groupExitMsg;
        if (respondInGroups !== undefined) updatePayload.respondInGroups = respondInGroups ? 1 : 0;
        if (respondInPrivate !== undefined) updatePayload.respondInPrivate = respondInPrivate ? 1 : 0;
        if (privateWelcomeEnabled !== undefined) updatePayload.privateWelcomeEnabled = privateWelcomeEnabled ? 1 : 0;
        if (privateExitEnabled !== undefined) updatePayload.privateExitEnabled = privateExitEnabled ? 1 : 0;
        if (memoryEnabled !== undefined) updatePayload.memoryEnabled = memoryEnabled ? 1 : 0;
        if (analysisEnabled !== undefined) updatePayload.analysisEnabled = analysisEnabled ? 1 : 0;
        if (analysisInstructions !== undefined) updatePayload.analysisInstructions = analysisInstructions;

        // If admin provides geminiKeys, update it. If client/owner, preserve server-stored keys!
        if (authRole === 'ADMIN' && typeof geminiKeys === 'string') {
            updatePayload.geminiKeys = geminiKeys;
        }

        // Final sanitization pass to remove any accidental undefined keys
        Object.keys(updatePayload).forEach(key => {
            if (updatePayload[key] === undefined) {
                delete updatePayload[key];
            }
        });

        console.log(`[Config Update] botId: ${req.params.id} | fields: ${Object.keys(updatePayload).join(', ')}`);

        await updateDoc(botRef, updatePayload);

        // Read-back verification to guarantee persistence in Firestore
        const verifySnap = await getDoc(botRef);
        if (!verifySnap.exists()) {
            throw new Error("Falha na verificação de persistência: documento do bot não encontrado no Firestore após gravação.");
        }
        const savedBotData = verifySnap.data();

        await recordAuditLog(firestoreDb, {
            botId: req.params.id,
            role: authRole,
            actorRole: authRole,
            action: 'CONFIG_UPDATED',
            result: 'SUCCESS',
            details: 'Configurações do bot atualizadas, confirmadas e persistidas no Firestore',
            fieldsChanged: Object.keys(updatePayload),
            oldValue: currentBot,
            newValue: savedBotData
        });

        res.send({ status: "Configuração salva e confirmada no Firestore!", config: savedBotData });
    } catch (e: any) {
        console.error("Erro ao salvar config:", e);
        await recordAuditLog(firestoreDb, {
            botId: req.params.id,
            action: 'CONFIG_UPDATE_FAILED',
            result: 'ERROR',
            details: 'Erro ao salvar configurações do bot',
            errorMessage: e.message,
            stack: e.stack
        });
        res.status(500).send({ error: "Erro ao salvar config: " + e.message });
    }
});

// Audit Logs Endpoint for Bot
app.get('/api/bot/:id/audit-logs', requireBotAuth, async (req, res) => {
    try {
        const limitCount = parseInt((req.query.limit as string) || '50', 10);
        const type = req.query.type as string;
        const actor = req.query.actor as string;
        const action = req.query.action as string;
        const search = req.query.search as string;

        const logs = await fetchAuditLogs(firestoreDb, req.params.id, limitCount, {
            type,
            actor,
            action,
            search
        });
        res.send(logs);
    } catch (e: any) {
        console.error("Erro ao buscar logs de auditoria:", e);
        res.status(500).send({ error: "Erro ao buscar logs de auditoria" });
    }
});

// Admin Global Audit Logs Endpoint
app.get('/api/admin/audit-logs', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'] as string;
        const isAdmin = adminKey === (process.env.ADMIN_KEY || 'techstar_master_2024') || 
                        req.headers['x-requested-by'] === 'techstar-admin';

        if (!isAdmin) {
            return res.status(403).json({ error: 'Acesso restrito ao Administrador Global' });
        }

        const targetBotId = (req.query.botId as string) || 'all';
        const limitCount = parseInt((req.query.limit as string) || '100', 10);
        const type = req.query.type as string;
        const actor = req.query.actor as string;
        const action = req.query.action as string;
        const search = req.query.search as string;

        let allLogs: any[] = [];
        if (targetBotId && targetBotId !== 'all') {
            allLogs = await fetchAuditLogs(firestoreDb, targetBotId, limitCount, { type, actor, action, search });
        } else {
            const botsSnap = await getDocs(collection(firestoreDb, 'bots'));
            for (const bDoc of botsSnap.docs) {
                const bLogs = await fetchAuditLogs(firestoreDb, bDoc.id, 20, { type, actor, action, search });
                allLogs.push(...bLogs);
            }
            allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            allLogs = allLogs.slice(0, limitCount);
        }

        res.json(allLogs);
    } catch (e: any) {
        console.error("Erro ao buscar logs globais de auditoria:", e);
        res.status(500).json({ error: "Erro ao buscar logs de auditoria: " + e.message });
    }
});

// Dedicated Endpoint: Grupos onde o Bot é Administrador
app.get('/api/bot/:id/admin-groups', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const currentBot = (req as any).bot;
        const authRole = (req as any).authRole;

        if (authRole !== 'ADMIN' && !hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
            return res.status(403).json({ error: 'Permissão insuficiente para visualizar grupos do bot.' });
        }

        const sock = activeSocks.get(botId);
        const allGroups = await syncBotGroups(botId, sock, firestoreDb, currentBot);
        const adminGroups = allGroups
            .filter((g: any) => g.botIsAdmin)
            .map((g: any) => ({
                groupId: g.groupId,
                groupName: g.groupName,
                groupDesc: g.groupDesc,
                participantCount: g.participantCount,
                botIsAdmin: true,
                botRole: g.botRole || 'admin',
                canDeleteMessages: true,
                canKickParticipants: true,
                canEditGroupInfo: true,
                lastSyncedAt: new Date().toISOString(),
                config: g.config
            }));

        res.json(adminGroups);
    } catch (err: any) {
        console.error(`Erro ao obter grupos admin do bot ${req.params.id}:`, err);
        res.status(500).json({ error: "Erro ao obter grupos admin: " + err.message });
    }
});

// ==========================================
// GESTÃO AVANÇADA DE GRUPOS WHATSAPP (API)
// ==========================================

// 1. Listar todos os grupos em que o bot participa
app.get('/api/bot/:id/groups', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const currentBot = (req as any).bot;
        const authRole = (req as any).authRole;

        if (authRole !== 'ADMIN' && !hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
            return res.status(403).json({ error: 'Permissão insuficiente para visualizar grupos.' });
        }

        const sock = activeSocks.get(botId);
        const allGroups = await syncBotGroups(botId, sock, firestoreDb, currentBot);
        res.json(allGroups);
    } catch (err: any) {
        console.error("Erro ao listar grupos do bot:", err);
        res.status(500).json({ error: "Erro ao listar grupos: " + err.message });
    }
});

// 2. Obter detalhes e configuração de um grupo específico
app.get('/api/bot/:id/groups/:groupId', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const groupId = req.params.groupId;
        const currentBot = (req as any).bot;
        const authRole = (req as any).authRole;

        if (authRole !== 'ADMIN' && !hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
            return res.status(403).json({ error: 'Permissão insuficiente para visualizar este grupo.' });
        }

        const sock = activeSocks.get(botId);
        let meta = null;
        if (sock && connectionStatuses.get(botId) === 'Conectado') {
            meta = await getGroupMeta(sock, groupId, true);
            if (meta) {
                try {
                    const groupRef = doc(firestoreDb, 'bots', botId, 'groups', groupId);
                    await setDoc(groupRef, {
                        botId,
                        groupId,
                        groupName: meta.subject,
                        groupDesc: meta.desc || '',
                        participantCount: meta.size,
                        botIsAdmin: meta.botIsAdmin,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                } catch (sErr) {
                    console.error(`[Bot ${botId}] Erro ao atualizar metadata de ${groupId}:`, sErr);
                }
            }
        }

        const config = await getGroupConfig(firestoreDb, botId, groupId, meta?.subject);

        // Contagem de advertências ativas
        const warnSnap = await getDocs(collection(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings'));
        const activeWarnings = warnSnap.docs.filter(d => (d.data().count || 0) > 0).length;

        // Logs recentes
        const logsRef = collection(firestoreDb, 'bots', botId, 'groups', groupId, 'logs');
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(15));
        const logsSnap = await getDocs(logsQuery);
        const recentLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const finalBotIsAdmin = meta !== null ? meta.botIsAdmin : (config.botIsAdmin || false);

        res.json({
            groupId,
            groupName: meta?.subject || config.groupName,
            groupDesc: meta?.desc || config.groupDesc || '',
            participantCount: meta?.size || config.participantCount || 0,
            botIsAdmin: finalBotIsAdmin,
            config: {
                ...config,
                botIsAdmin: finalBotIsAdmin
            },
            activeWarnings,
            recentLogs
        });
    } catch (err: any) {
        console.error("Erro ao obter grupo:", err);
        res.status(500).json({ error: "Erro ao obter grupo: " + err.message });
    }
});

// 3. Atualizar configuração de um grupo
app.post('/api/bot/:id/groups/:groupId', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const groupId = req.params.groupId;
        const currentBot = (req as any).bot;
        const authRole = (req as any).authRole;

        if (authRole !== 'ADMIN' && !hasPermission(currentBot, PERMISSIONS.GROUP_MANAGE)) {
            return res.status(403).json({ error: 'Permissão insuficiente para alterar configurações do grupo.' });
        }

        const groupRef = doc(firestoreDb, 'bots', botId, 'groups', groupId);
        const incoming = req.body;

        const updatedConfig: Partial<GroupConfig> = {
            ...incoming,
            botId,
            groupId,
            updatedAt: serverTimestamp()
        };

        await setDoc(groupRef, updatedConfig, { merge: true });

        // Atualiza agendador de motivação diária
        const fullConfig = await getGroupConfig(firestoreDb, botId, groupId);
        scheduleGroupMotivation({
            botId,
            groupConfig: fullConfig,
            getActiveSock: (id) => activeSocks.get(id),
            firestoreDb,
            geminiKeys: currentBot.geminiKeys
        });

        await recordGroupLog(firestoreDb, {
            botId,
            groupId,
            groupName: fullConfig.groupName,
            action: 'CONFIG_UPDATED',
            actor: authRole === 'ADMIN' ? 'ADMIN_WEB' : 'CLIENT_WEB',
            details: 'Configurações de moderação e automação do grupo salvas via painel web.'
        });

        res.json({ status: "Configuração do grupo atualizada com sucesso!", config: fullConfig });
    } catch (err: any) {
        console.error("Erro ao atualizar config do grupo:", err);
        res.status(500).json({ error: "Erro ao atualizar grupo: " + err.message });
    }
});

// 4. Listar membros com advertências em um grupo
app.get('/api/bot/:id/groups/:groupId/warnings', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const groupId = req.params.groupId;

        const warnSnap = await getDocs(collection(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings'));
        const warnings = warnSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((w: any) => (w.count || 0) > 0);

        res.json(warnings);
    } catch (err: any) {
        res.status(500).json({ error: "Erro ao buscar advertências: " + err.message });
    }
});

// 5. Zerar advertências de membro ou grupo
app.post('/api/bot/:id/groups/:groupId/warnings/reset', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const groupId = req.params.groupId;
        const { participantPhone } = req.body;

        if (participantPhone) {
            const cleanPhone = normalizePhone(participantPhone);
            await setDoc(doc(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings', cleanPhone), {
                count: 0,
                reasons: [],
                lastWarningAt: new Date().toISOString()
            }, { merge: true });
        } else {
            // Zera todos
            const warnSnap = await getDocs(collection(firestoreDb, 'bots', botId, 'groups', groupId, 'warnings'));
            const batch = writeBatch(firestoreDb);
            warnSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        await recordGroupLog(firestoreDb, {
            botId,
            groupId,
            action: 'WARNINGS_CLEARED',
            actor: 'WEB_PANEL',
            targetUser: participantPhone || 'ALL',
            details: participantPhone ? `Advertências de ${participantPhone} zeradas.` : 'Todas as advertências do grupo foram zeradas.'
        });

        res.json({ status: "Advertências zeradas com sucesso!" });
    } catch (err: any) {
        res.status(500).json({ error: "Erro ao zerar advertências: " + err.message });
    }
});

// 6. Logs de moderação do grupo
app.get('/api/bot/:id/groups/:groupId/logs', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const groupId = req.params.groupId;

        const logsRef = collection(firestoreDb, 'bots', botId, 'groups', groupId, 'logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(50));
        const snap = await getDocs(q);
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        res.json(logs);
    } catch (err: any) {
        res.status(500).json({ error: "Erro ao buscar logs do grupo: " + err.message });
    }
});

// 7. Teste de envio de Mensagem Diária Motivacional
app.post('/api/bot/:id/groups/:groupId/test-motivation', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const groupId = req.params.groupId;
        const currentBot = (req as any).bot;

        const sock = activeSocks.get(botId);
        if (!sock) {
            return res.status(400).json({ error: "O bot precisa estar conectado ao WhatsApp para enviar mensagem de teste." });
        }

        const result = await sendDailyMotivationToGroup({
            botId,
            groupId,
            sock,
            firestoreDb,
            geminiKeys: currentBot.geminiKeys,
            isTest: true
        });

        res.json({ status: "Mensagem motivacional enviada com sucesso ao grupo!", details: result.messageText });
    } catch (err: any) {
        console.error("Erro ao enviar mensagem de teste:", err);
        res.status(500).json({ error: "Erro ao enviar teste: " + err.message });
    }
});

// 8. Executar ação de administração manual (ex: expulsar membro)
app.post('/api/bot/:id/groups/:groupId/action', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const groupId = req.params.groupId;
        const { action, participantJid } = req.body;
        const currentBot = (req as any).bot;

        const sock = activeSocks.get(botId);
        if (!sock) {
            return res.status(400).json({ error: "O bot está desconectado do WhatsApp." });
        }

        if (action === 'kick' && participantJid) {
            const meta = await getGroupMeta(sock, groupId);
            const targetPhone = normalizePhone(participantJid);
            const botPhone = sock.user?.id ? normalizePhone(sock.user.id) : '';
            const ownerPhone = normalizePhone(currentBot.ownerPhone || currentBot.ownerNumber);

            if (meta?.admins.has(participantJid) || isPhoneMatch(targetPhone, ownerPhone) || isPhoneMatch(targetPhone, botPhone)) {
                return res.status(400).json({ error: "Ação bloqueada: Não é permitido remover administradores, o dono ou o próprio bot." });
            }

            if (!meta?.botIsAdmin) {
                return res.status(400).json({ error: "O bot precisa ser administrador do grupo no WhatsApp para remover membros." });
            }

            await sock.groupParticipantsUpdate(groupId, [participantJid], 'remove');
            await recordGroupLog(firestoreDb, {
                botId,
                groupId,
                action: 'MEMBER_REMOVED_MANUAL_PANEL',
                actor: 'WEB_PANEL',
                targetUser: targetPhone,
                details: `Remoção do membro ${targetPhone} executada via Painel Web`
            });

            return res.json({ status: `Membro @${targetPhone} removido com sucesso do grupo.` });
        }

        res.status(400).json({ error: "Ação não suportada ou parâmetros inválidos." });
    } catch (err: any) {
        res.status(500).json({ error: "Erro ao executar ação: " + err.message });
    }
});

// Reset Session (Protected)
app.post('/api/bot/:id/reset', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const currentBot = (req as any).bot;
        const authRole = (req as any).authRole;

        if (authRole !== 'ADMIN' && !hasPermission(currentBot, PERMISSIONS.WHATSAPP_MANAGE)) {
            return res.status(403).json({ error: 'Permissão insuficiente para reiniciar a conexão do WhatsApp.' });
        }

        console.log(`[${authRole}] Resetando sessão do bot: ${botId}`);

        await resetBotSession(botId);

        await recordAuditLog(firestoreDb, {
            botId,
            role: authRole,
            action: 'SESSION_RESET',
            result: 'SUCCESS',
            details: 'Sessão Baileys limpa e bot reiniciado para gerar novo QR Code'
        });

        res.send({ status: "Sessão resetada e bot reiniciado!" });
    } catch (e) {
        console.error("Erro ao resetar bot:", e);
        res.status(500).send({ error: "Erro ao resetar bot" });
    }
});

app.delete('/api/admin/bots/:id', async (req, res) => {
    const botId = req.params.id;
    try {
        console.log(`[Admin] [BOT_DELETED] Apagando bot: ${botId}`);

        // Clear any scheduled reconnection timers
        if (reconnectTimers.has(botId)) {
            clearTimeout(reconnectTimers.get(botId));
            reconnectTimers.delete(botId);
        }
        botReconnectAttempts.delete(botId);

        // Stop bot if running
        if (activeSocks.has(botId)) {
            try {
                const sock = activeSocks.get(botId);
                sock.ev.removeAllListeners('connection.update');
                sock.end(undefined);
            } catch(e) {}
            activeSocks.delete(botId);
        }

        // Clean up state
        startingBots.delete(botId);
        qrCodes.delete(botId);
        connectionStatuses.delete(botId);

        // Delete auth folder
        const authPath = path.join(process.cwd(), 'auth_info', `bot_${botId}`);
        if (fs.existsSync(authPath)) {
            try {
                fs.rmSync(authPath, { recursive: true, force: true });
            } catch (e) {
                console.error(`[Admin] Erro ao deletar pasta de auth do bot ${botId}:`, e);
            }
        }

        // Delete from DB
        const botRef = doc(firestoreDb, 'bots', botId);
        await deleteDoc(botRef);
        
        const historySnapshot = await getDocs(collection(botRef, 'history'));
        const batch = writeBatch(firestoreDb);
        historySnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        res.send({ status: "Bot apagado com sucesso!" });
    } catch (error) {
        console.error(`[Admin] Erro ao apagar bot ${botId}:`, error);
        res.status(500).send({ error: "Erro ao apagar bot" });
    }
});

// Initialize existing active bots
async function initBots() {
    try {
        const q = query(collection(firestoreDb, 'bots'));
        const snapshot = await getDocs(q);
        for (const docItem of snapshot.docs) {
            const data = docItem.data();
            if (!data.accessToken) {
                const token = generateSecureToken();
                await updateDoc(docItem.ref, { accessToken: token });
                console.log(`[Segurança] Token gerado para bot ${data.name} (${docItem.id})`);
            }
            if (data.active) {
                startBot(docItem.id);
            }
        }
    } catch (e) {
        console.error("Erro ao inicializar bots:", e);
    }
}
initBots();

// Rota de Health Check
app.get('/health', (req, res) => res.send("TechStar Bot is Alive 24h"));

// API: Estatísticas Consolidadas do Admin
app.get('/api/admin/stats', async (req, res) => {
    try {
        const q = query(collection(firestoreDb, 'bots'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const bots = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        let totalMessages = 0;
        const uniqueContacts = new Set();
        const botStatsList = [];

        for (const bot of bots) {
            const status = connectionStatuses.get(bot.id) || "Desconectado";
            const botRef = doc(firestoreDb, 'bots', bot.id);
            const historySnap = await getDocs(collection(botRef, 'history'));
            const botMsgCount = historySnap.size;
            totalMessages += botMsgCount;
            
            const botContacts = new Set();
            historySnap.docs.forEach(d => {
                const jid = d.data().jid;
                if (jid) {
                    uniqueContacts.add(jid);
                    botContacts.add(jid);
                }
            });

            botStatsList.push({
                botId: bot.id,
                name: (bot as any).name || 'Bot sem nome',
                status,
                messagesCount: botMsgCount,
                contactsCount: botContacts.size
            });
        }

        const onlineCount = bots.filter(b => connectionStatuses.get(b.id) === 'Conectado').length;

        // Buscar logs recentes de auditoria de todos os bots
        const recentLogs: any[] = [];
        for (const bot of bots.slice(0, 5)) {
            const logs = await fetchAuditLogs(firestoreDb, bot.id, 5);
            recentLogs.push(...logs);
        }
        recentLogs.sort((a, b) => (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));

        res.json({
            totalBots: bots.length,
            onlineBots: onlineCount,
            offlineBots: bots.length - onlineCount,
            totalMessages,
            totalUsers: uniqueContacts.size,
            botStats: botStatsList,
            recentActivity: recentLogs.slice(0, 10)
        });
    } catch (e) {
        console.error("Erro ao carregar estatísticas do admin:", e);
        res.status(500).json({ error: "Erro ao carregar estatísticas" });
    }
});

// API: Estatísticas Específicas do Bot
app.get('/api/bot/:id/stats', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const botRef = doc(firestoreDb, 'bots', botId);
        const historySnap = await getDocs(collection(botRef, 'history'));
        const messages = historySnap.docs.map(d => d.data());
        
        const contacts = new Set<string>();
        let userMessages = 0;
        let modelMessages = 0;

        messages.forEach(m => {
            if (m.jid) contacts.add(m.jid);
            if (m.role === 'user') userMessages++;
            else if (m.role === 'model') modelMessages++;
        });

        res.json({
            totalMessages: messages.length,
            userMessages,
            modelMessages,
            totalContacts: contacts.size,
            memoryItems: messages.length
        });
    } catch (e) {
        console.error("Erro ao buscar estatísticas do bot:", e);
        res.status(500).json({ error: "Erro ao buscar estatísticas" });
    }
});

// API: Listagem de Memória de Contexto (Histórico)
app.get('/api/bot/:id/memory', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const botRef = doc(firestoreDb, 'bots', botId);
        const historySnap = await getDocs(query(collection(botRef, 'history'), orderBy('timestamp', 'desc'), limit(200)));
        
        const contactsMap = new Map<string, { jid: string; messageCount: number; lastMessage: string; lastTimestamp: any }>();

        historySnap.docs.forEach(d => {
            const data = d.data();
            const jid = data.jid || 'desconhecido';
            const existing = contactsMap.get(jid);
            const ts = data.timestamp ? ((data.timestamp as any).toDate ? (data.timestamp as any).toDate().toISOString() : data.timestamp) : new Date().toISOString();

            if (!existing) {
                contactsMap.set(jid, {
                    jid,
                    messageCount: 1,
                    lastMessage: (data.text || '').substring(0, 80),
                    lastTimestamp: ts
                });
            } else {
                existing.messageCount++;
            }
        });

        res.json(Array.from(contactsMap.values()));
    } catch (e) {
        console.error("Erro ao buscar memória do bot:", e);
        res.status(500).json({ error: "Erro ao buscar memória" });
    }
});

// API: Limpeza de Memória de Contexto
app.post('/api/bot/:id/memory/clear', requireBotAuth, async (req, res) => {
    try {
        const botId = req.params.id;
        const currentBot = (req as any).bot;
        const authRole = (req as any).authRole;

        if (authRole !== 'ADMIN' && !hasPermission(currentBot, PERMISSIONS.MEMORY_MANAGE)) {
            return res.status(403).json({ error: "Permissão insuficiente para limpar a memória do bot." });
        }

        const botRef = doc(firestoreDb, 'bots', botId);
        const historySnap = await getDocs(collection(botRef, 'history'));
        
        const batch = writeBatch(firestoreDb);
        historySnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        await recordAuditLog(firestoreDb, {
            botId,
            role: authRole,
            action: 'CLEAR_HISTORY',
            result: 'SUCCESS',
            details: `Toda a memória (${historySnap.size} mensagens) foi limpa pelo ${authRole}.`
        });

        res.json({ status: "Memória limpa com sucesso!", clearedCount: historySnap.size });
    } catch (e) {
        console.error("Erro ao limpar memória:", e);
        res.status(500).json({ error: "Erro ao limpar memória" });
    }
});

async function connectWA() {
    // This function is now replaced by startBot(botId) logic
}

const PORT = 3000;

let server: any = null;

async function setupFrontendAndListen() {
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Painel TechStar Multi-Bot rodando na porta ${PORT}`);
    });
}

setupFrontendAndListen();

// Encerramento limpo e liberação de recursos
const cleanup = () => {
    console.log('[Server] Recebido sinal de término. Liberando portas e conexões...');
    for (const [botId, sock] of activeSocks.entries()) {
        try {
            sock.ev?.removeAllListeners('connection.update');
            sock.end?.(undefined);
        } catch {}
    }
    activeSocks.clear();
    if (server) {
        server.close(() => {
            console.log('[Server] Servidor HTTP finalizado.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
    setTimeout(() => {
        process.exit(0);
    }, 3000);
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGHUP', cleanup);

process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled Rejection:', reason);
});

