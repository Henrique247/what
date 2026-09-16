import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import { GoogleGenAI } from "@google/genai";
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
    rateLimiter 
} from './src/security';
import { recordAuditLog, fetchAuditLogs } from './src/audit';
import { handleWhatsAppAdminMessage } from './src/whatsappController';

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
    const keys = keysStr.split(',').map(k => k.trim()).filter(k => k !== "");
    return keys.map((k: string) => {
        const cleanKey = k.trim().replace(/["']/g, '');
        return cleanKey ? new GoogleGenAI({ apiKey: cleanKey }) : null;
    }).filter(ai => ai !== null);
}

const currentKeyIndexes = new Map<string, number>();

const startingBots = new Set<string>();

async function resetBotSession(botId: string) {
    console.log(`[Bot ${botId}] Resetando sessão WhatsApp e gerando novo QR...`);
    if (activeSocks.has(botId)) {
        try {
            const sock = activeSocks.get(botId);
            sock.ev.removeAllListeners('connection.update');
            sock.end(undefined);
        } catch(e) {}
        activeSocks.delete(botId);
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
        console.log(`[Bot ${botId}] Já está iniciando, ignorando nova chamada.`);
        return;
    }
    startingBots.add(botId);
    console.log(`[Bot ${botId}] Iniciando bot...`);

    try {
        const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        const bot = botDoc.data();
        if (!bot || !bot.active) {
            console.log(`[Bot ${botId}] Bot inativo ou não encontrado.`);
            startingBots.delete(botId);
            return;
        }

        if (activeSocks.has(botId)) {
            console.log(`[Bot ${botId}] Fechando conexão anterior...`);
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

        console.log(`[Bot ${botId}] Criando socket...`);
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
            keepAliveIntervalMs: 10000,
            generateHighQualityLinkPreview: false,
        });

        activeSocks.set(botId, sock);
        connectionStatuses.set(botId, "Conectando...");

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log(`[Bot ${botId}] QR Code recebido do Baileys. Convertendo para DataURL...`);
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
            console.log(`[Bot ${botId}] Conexão fechada. Código: ${statusCode}`);
            
            connectionStatuses.set(botId, "Desconectado");
            qrCodes.delete(botId);
            
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            // Re-check if bot is still active in DB before reconnecting
            const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
            const bot = botDoc.data();
            if (!bot || !bot.active) {
                console.log(`[Bot ${botId}] Bot desativado no banco, não irá reconectar.`);
                activeSocks.delete(botId);
                startingBots.delete(botId);
                return;
            }

            if (statusCode === DisconnectReason.restartRequired) {
                console.log(`[Bot ${botId}] Reinício necessário. Reiniciando agora...`);
                startingBots.delete(botId);
                startBot(botId);
            } else if (shouldReconnect) {
                const delay = 5000;
                console.log(`[Bot ${botId}] Tentando reconectar em ${delay/1000}s...`);
                setTimeout(() => {
                    startingBots.delete(botId);
                    startBot(botId);
                }, delay);
            } else {
                console.log(`[Bot ${botId}] Deslogado. Não irá reconectar automaticamente.`);
                activeSocks.delete(botId);
                startingBots.delete(botId);
            }
        } else if (connection === 'open') {
            console.log(`[Bot ${botId}] Conexão estabelecida com sucesso!`);
            connectionStatuses.set(botId, "Conectado");
            qrCodes.delete(botId);
            startingBots.delete(botId);
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
        
        if (action === 'add' && currentBot.groupWelcomeEnabled) {
            console.log(`[Bot ${botId}] Processando entrada de participantes no grupo ${id}. Total: ${participants.length}`);
            for (const participant of participants) {
                const jid = typeof participant === 'string' ? participant : (participant.jid || participant.id);
                if (!jid || typeof jid !== 'string') {
                    console.log(`[Bot ${botId}] JID de participante inválido:`, participant);
                    continue;
                }

                const mentionText = `@${jid.split('@')[0]}`;
                const msg = currentBot.groupWelcomeMsg || `Bem-vindo ao grupo ${mentionText}!`;
                
                // Se a mensagem não contém a menção, adicionamos no final para garantir que o usuário seja notificado
                const finalMsg = msg.includes(mentionText) ? msg : `${msg}\n\n${mentionText}`;

                console.log(`[Bot ${botId}] Enviando boas-vindas para ${jid} no grupo ${id}`);
                try {
                    await sock.sendMessage(id, { 
                        text: finalMsg, 
                        mentions: [jid] 
                    });
                } catch (err) {
                    console.error(`[Bot ${botId}] Erro ao enviar boas-vindas:`, err);
                }
            }
        } else if (action === 'remove' && currentBot.groupExitEnabled) {
            console.log(`[Bot ${botId}] Processando saída de participantes no grupo ${id}. Total: ${participants.length}`);
            for (const participant of participants) {
                const jid = typeof participant === 'string' ? participant : (participant.jid || participant.id);
                if (!jid || typeof jid !== 'string') {
                    console.error(`[Bot ${botId}] JID inválido ao tentar enviar mensagem de saída:`, participant);
                    continue;
                }
                
                const msg = currentBot.groupExitMsg || "Olá, notamos que você saiu do grupo. Algum motivo especial? Gostaríamos de saber seu feedback!";
                console.log(`[Bot ${botId}] Enviando mensagem de saída privada para ${jid}`);
                try {
                    await sock.sendMessage(jid, { text: msg });
                } catch (err) {
                    console.error(`[Bot ${botId}] Erro ao enviar mensagem privada para ${jid}:`, err);
                }
            }
        }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        
        const messageType = Object.keys(msg.message)[0];
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.documentMessage?.caption || "";
        
        // Reload bot config for each message to ensure latest settings
        const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
        const currentBot = botDoc.data();
        if (!currentBot || !currentBot.active) return;

        // Intercept administrative commands and owner management intents via WhatsApp
        const adminResult = await handleWhatsAppAdminMessage({
            sock,
            botId,
            currentBot,
            senderJid: msg.key.participant || jid,
            text,
            firestoreDb,
            isGroup,
            onResetBot: async (targetBotId: string) => {
                await resetBotSession(targetBotId);
            }
        });

        if (adminResult.handled) {
            return;
        }

        // Check for media
        const isImage = messageType === 'imageMessage';
        const isDocument = messageType === 'documentMessage';
        const isPdf = isDocument && msg.message.documentMessage.mimetype === 'application/pdf';

        if ((isImage || isPdf) && !currentBot.analysisEnabled) return;
        if (!text && !isImage && !isPdf) return;

        // Check if bot should respond in this context
        if (isGroup && !currentBot.respondInGroups) return;
        if (!isGroup && !currentBot.respondInPrivate) return;

        // Handle private exit command
        if (!isGroup && text.toLowerCase() === '!sair' && currentBot.privateExitEnabled) {
            await sock.sendMessage(jid, { text: currentBot.exitMsg || "Até logo!" });
            return;
        }

        const genAIs = getGenAIInstances(currentBot.geminiKeys || "");
        if (genAIs.length === 0) return;

        try {
            const history = currentBot.memoryEnabled ? await getHistory(botId, jid) : [];
            
            // Handle private welcome message (first contact)
            if (!isGroup && history.length === 0 && currentBot.privateWelcomeEnabled) {
                await sock.sendMessage(jid, { text: currentBot.welcomeMsg || "Olá! Como posso ajudar?" });
                // Don't return, let Gemini process the first message too
            }

            const parts: any[] = [];
            if (text) parts.push({ text });

            if ((isImage || isPdf) && currentBot.analysisEnabled) {
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
            }

            await saveMessage(botId, jid, 'user', text || "[Mídia enviada]");

            const isOwner = currentBot.ownerNumber && jid.includes(currentBot.ownerNumber);
            let ownerInstruction = "";
            if (isOwner) {
                ownerInstruction = `\n\nVOCÊ ESTÁ FALANDO COM SEU PROPRIETÁRIO: ${currentBot.ownerName}. Ele tem permissão total. Se ele pedir relatórios, resumos ou informações sobre o sistema, forneça-os de forma clara e detalhada.`;
            }

            const pdfInstruction = "\n\nSe o usuário solicitar um PDF ou se você achar que a resposta deve ser um documento formal, escreva o conteúdo que deve ir no PDF entre as tags <pdf> e </pdf>. O sistema converterá automaticamente esse conteúdo em um arquivo PDF e enviará ao usuário.";
            const fullSystemPrompt = `${currentBot.systemPrompt}${ownerInstruction}${pdfInstruction}\n\nBASE DE CONHECIMENTO:\n${currentBot.knowledgeBase || "Nenhuma"}`;
            
            // Retry logic with rotation
            let attempts = 0;
            const maxAttempts = genAIs.length * 2;
            let response;
            let keyIndex = currentKeyIndexes.get(botId) || 0;

            while (attempts < maxAttempts) {
                try {
                    const currentAI = genAIs[keyIndex % genAIs.length];
                    response = await currentAI.models.generateContent({
                        model: "gemini-3-flash-preview",
                        contents: [...history, { role: 'user', parts }],
                        config: { systemInstruction: fullSystemPrompt }
                    });
                    currentKeyIndexes.set(botId, keyIndex % genAIs.length);
                    break;
                } catch (err: any) {
                    attempts++;
                    const is429 = err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("RESOURCE_EXHAUSTED");
                    if (is429) {
                        keyIndex++;
                        continue;
                    }
                    throw err;
                }
            }

            const responseText = response?.text;
            if (responseText) {
                await saveMessage(botId, jid, 'model', responseText);
                
                // Check for PDF tags
                const pdfMatch = responseText.match(/<pdf>([\s\S]*?)<\/pdf>/i);
                
                if (pdfMatch) {
                    try {
                        const pdfContent = pdfMatch[1].trim();
                        const pdfBuffer = await createPDF(pdfContent);
                        
                        // Remove tags from text response if we want to send text too, 
                        // or just send the PDF. Let's send both if there's text outside tags.
                        const cleanText = responseText.replace(/<pdf>[\s\S]*?<\/pdf>/gi, '').trim();
                        
                        if (cleanText) {
                            await sock.sendMessage(jid, { text: cleanText });
                        }
                        
                        await sock.sendMessage(jid, { 
                            document: pdfBuffer, 
                            mimetype: 'application/pdf', 
                            fileName: 'documento.pdf',
                            caption: 'Aqui está o seu PDF solicitado!'
                        });
                    } catch (pdfErr) {
                        console.error(`[Bot ${botId}] Erro ao gerar PDF:`, pdfErr);
                        await sock.sendMessage(jid, { text: responseText });
                    }
                } else {
                    await sock.sendMessage(jid, { text: responseText });
                }
            }
        } catch (e) {
            console.error(`Erro no Bot ${botId}:`, e);
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
        const normPhone = normalizePhone(ownerNumber || currentBot.ownerPhone || currentBot.ownerNumber);

        const updatePayload: any = {
            name: name !== undefined ? name : currentBot.name,
            systemPrompt: systemPrompt !== undefined ? systemPrompt : currentBot.systemPrompt,
            welcomeMsg: welcomeMsg !== undefined ? welcomeMsg : currentBot.welcomeMsg,
            exitMsg: exitMsg !== undefined ? exitMsg : currentBot.exitMsg,
            knowledgeBase: knowledgeBase !== undefined ? knowledgeBase : currentBot.knowledgeBase,
            ownerName: ownerName !== undefined ? ownerName : currentBot.ownerName,
            ownerNumber: ownerNumber !== undefined ? ownerNumber : currentBot.ownerNumber,
            ownerPhone: normPhone,
            groupWelcomeEnabled: groupWelcomeEnabled ? 1 : 0,
            groupWelcomeMsg: groupWelcomeMsg !== undefined ? groupWelcomeMsg : currentBot.groupWelcomeMsg,
            groupExitEnabled: groupExitEnabled ? 1 : 0,
            groupExitMsg: groupExitMsg !== undefined ? groupExitMsg : currentBot.groupExitMsg,
            respondInGroups: respondInGroups ? 1 : 0,
            respondInPrivate: respondInPrivate ? 1 : 0,
            privateWelcomeEnabled: privateWelcomeEnabled ? 1 : 0,
            privateExitEnabled: privateExitEnabled ? 1 : 0,
            memoryEnabled: memoryEnabled ? 1 : 0,
            analysisEnabled: analysisEnabled ? 1 : 0,
            analysisInstructions: analysisInstructions !== undefined ? analysisInstructions : currentBot.analysisInstructions
        };

        // If admin provides geminiKeys, update it. If client/owner, preserve server-stored keys!
        if (authRole === 'ADMIN' && typeof geminiKeys === 'string') {
            updatePayload.geminiKeys = geminiKeys;
        }

        await updateDoc(botRef, updatePayload);

        await recordAuditLog(firestoreDb, {
            botId: req.params.id,
            role: authRole,
            action: 'CONFIG_UPDATED',
            result: 'SUCCESS',
            details: 'Configurações do bot atualizadas com sucesso via Web'
        });

        res.send({ status: "Configuração salva!" });
    } catch (e) {
        console.error("Erro ao salvar config:", e);
        res.status(500).send({ error: "Erro ao salvar config" });
    }
});

// Audit Logs Endpoint
app.get('/api/bot/:id/audit-logs', requireBotAuth, async (req, res) => {
    try {
        const logs = await fetchAuditLogs(firestoreDb, req.params.id, 30);
        res.send(logs);
    } catch (e: any) {
        console.error("Erro ao buscar logs de auditoria:", e);
        res.status(500).send({ error: "Erro ao buscar logs" });
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
        console.log(`[Admin] Apagando bot: ${botId}`);

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

// Serve Frontend
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TechStar Multi-Bot Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Fira Code', monospace; }
        .hacker-border { border: 1px solid #00ff00; box-shadow: 0 0 10px #00ff00; }
        .hacker-text { color: #00ff00; text-shadow: 0 0 5px #00ff00; }
        .hacker-bg { background-color: #0a0a0a; }
        .hacker-input { background: #1a1a1a; border: 1px solid #333; color: #00ff00; }
        .hacker-input:focus { border-color: #00ff00; outline: none; }
    </style>
</head>
<body class="hacker-bg text-gray-300 min-h-screen p-4 md:p-8">
    <div class="max-w-6xl mx-auto">
        <header class="mb-8 flex justify-between items-center border-b border-gray-800 pb-4">
            <div>
                <h1 class="text-3xl font-bold hacker-text">TECHSTAR_SAAS_v2.0</h1>
                <p class="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">Painel de Controle Multi-Instância</p>
            </div>
            <button onclick="openCreateModal()" class="bg-green-900 hover:bg-green-700 text-white px-4 py-2 rounded border border-green-400 text-sm">
                + NOVO_BOT
            </button>
        </header>

        <div id="bots-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Bots will be listed here -->
        </div>

        <footer class="mt-12 text-center text-gray-600 text-xs">
            &copy; 2024 TECHSTAR INDUSTRIES - MULTI-BOT SYSTEM
        </footer>
    </div>

    <!-- Create Bot Modal -->
    <div id="create-modal" class="fixed inset-0 bg-black/90 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-[#0a0a0a] border border-green-500 p-6 rounded-lg max-w-md w-full">
            <h2 class="text-xl hacker-text underline mb-4">CRIAR_NOVO_BOT</h2>
            <div class="space-y-4">
                <div>
                    <label class="block text-xs uppercase mb-1 hacker-text">Nome do Bot</label>
                    <input id="newBotName" type="text" class="w-full hacker-input p-2 rounded text-sm" placeholder="Ex: Atendimento Tech">
                </div>
                <div class="flex gap-4">
                    <button onclick="confirmCreateBot()" class="flex-1 bg-green-900 hover:bg-green-700 text-white font-bold py-2 rounded border border-green-400">
                        CRIAR
                    </button>
                    <button onclick="closeCreateModal()" class="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 py-2 rounded border border-gray-700">
                        CANCELAR
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Bot Config Modal -->
    <div id="bot-modal" class="fixed inset-0 bg-black/90 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-[#0a0a0a] border border-green-500 p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-6">
                <h2 id="modal-title" class="text-xl hacker-text underline">CONFIGURAR_BOT</h2>
                <button onclick="closeModal()" class="text-red-500 hover:text-red-400">FECHAR [X]</button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Nome do Bot</label>
                        <input id="botName" type="text" class="w-full hacker-input p-2 rounded text-sm">
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">System Prompt</label>
                        <textarea id="botPrompt" rows="4" class="w-full hacker-input p-2 rounded text-sm"></textarea>
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Gemini Keys (Separadas por vírgula)</label>
                        <textarea id="botKeys" rows="2" class="w-full hacker-input p-2 rounded text-sm"></textarea>
                    </div>
                </div>
                <div class="flex flex-col items-center justify-center border border-dashed border-gray-700 rounded p-4">
                    <h3 class="text-xs hacker-text mb-4 uppercase">WhatsApp QR Code</h3>
                    <div id="modal-qr-container" class="w-48 h-48 bg-white flex items-center justify-center rounded">
                        <p class="text-black text-[10px] text-center p-2">Aguardando...</p>
                    </div>
                    <p id="bot-status-text" class="mt-4 text-xs hacker-text uppercase">Status: Desconectado</p>
                </div>
            </div>

            <div class="mt-6 space-y-4">
                <div>
                    <label class="block text-xs uppercase mb-1 hacker-text">Base de Conhecimento</label>
                    <textarea id="botKnowledge" rows="4" class="w-full hacker-input p-2 rounded text-sm"></textarea>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Nome do Proprietário</label>
                        <input id="botOwnerName" type="text" class="w-full hacker-input p-2 rounded text-sm" placeholder="Ex: João">
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Número do Proprietário</label>
                        <input id="botOwnerNumber" type="text" class="w-full hacker-input p-2 rounded text-sm" placeholder="Ex: 5511999999999">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="flex items-center justify-between hacker-border p-2 rounded">
                        <label class="text-[10px] uppercase hacker-text">Responder em Privado</label>
                        <input id="respondInPrivate" type="checkbox" class="w-4 h-4 accent-green-500">
                    </div>
                    <div class="flex items-center justify-between hacker-border p-2 rounded">
                        <label class="text-[10px] uppercase hacker-text">Responder em Grupos</label>
                        <input id="respondInGroups" type="checkbox" class="w-4 h-4 accent-green-500">
                    </div>
                </div>

                <div class="hacker-border p-4 rounded-lg bg-black/50 space-y-4">
                    <h3 class="text-xs hacker-text underline uppercase">Recursos Avançados</h3>
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <label class="text-xs uppercase hacker-text">Memória de Contexto</label>
                            <p class="text-[8px] text-gray-500">Lembra conversas passadas para evitar repetições.</p>
                        </div>
                        <input id="memoryEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                    </div>
                    
                    <div class="border-t border-gray-800 pt-4">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex flex-col">
                                <label class="text-xs uppercase hacker-text">Análise de Mídia (Imagem/PDF)</label>
                                <p class="text-[8px] text-gray-500">Permite ao bot "ver" imagens e ler PDFs.</p>
                            </div>
                            <input id="analysisEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                        </div>
                        <label class="block text-[10px] uppercase mb-1 hacker-text">Instruções de Análise</label>
                        <textarea id="analysisInstructions" rows="3" class="w-full hacker-input p-2 rounded text-xs" placeholder="O que o bot deve procurar ou como deve analisar a mídia..."></textarea>
                    </div>
                </div>

                <div class="hacker-border p-4 rounded-lg bg-black/50 space-y-4">
                    <div class="flex items-center justify-between">
                        <label class="text-xs uppercase hacker-text">Boas-vindas (Primeiro Contato)</label>
                        <input id="privateWelcomeEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                    </div>
                    <input id="botWelcome" type="text" class="w-full hacker-input p-2 rounded text-sm" placeholder="Mensagem de boas-vindas...">
                    
                    <div class="flex items-center justify-between mt-4">
                        <label class="text-xs uppercase hacker-text">Mensagem de Saída (Comando !sair)</label>
                        <input id="privateExitEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                    </div>
                    <input id="botExit" type="text" class="w-full hacker-input p-2 rounded text-sm" placeholder="Mensagem de saída...">
                </div>

                <div class="hacker-border p-4 rounded-lg bg-black/50 space-y-4">
                    <h3 class="text-xs hacker-text underline uppercase">Recursos de Grupo</h3>
                    
                    <div class="flex items-center justify-between">
                        <label class="text-xs uppercase hacker-text">Boas-vindas em Grupos</label>
                        <input id="groupWelcomeEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                    </div>
                    <textarea id="groupWelcomeMsg" rows="2" class="w-full hacker-input p-2 rounded text-xs" placeholder="Mensagem ao entrar no grupo..."></textarea>

                    <div class="flex items-center justify-between mt-4">
                        <label class="text-xs uppercase hacker-text">Mensagem ao Sair (Privado)</label>
                        <input id="groupExitEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                    </div>
                    <textarea id="groupExitMsg" rows="2" class="w-full hacker-input p-2 rounded text-xs" placeholder="Mensagem enviada no privado ao sair..."></textarea>
                </div>

                <button onclick="saveBotConfig()" class="w-full bg-green-900 hover:bg-green-700 text-white font-bold py-3 rounded border border-green-400">
                    SALVAR_CONFIGURAÇÕES
                </button>
            </div>
        </div>
    </div>

    <script>
        let currentBotId = null;
        let qrInterval = null;

        function openCreateModal() {
            document.getElementById('create-modal').classList.remove('hidden');
            document.getElementById('newBotName').focus();
        }

        function closeCreateModal() {
            document.getElementById('create-modal').classList.add('hidden');
            document.getElementById('newBotName').value = '';
        }

        async function confirmCreateBot() {
            const name = document.getElementById('newBotName').value;
            if (!name) return;
            await fetch('/api/admin/bots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            closeCreateModal();
            fetchBots();
        }

        async function fetchBots() {
            try {
                const res = await fetch('/api/admin/bots');
                if (!res.ok) return;
                const bots = await res.json();
                const grid = document.getElementById('bots-grid');
                grid.innerHTML = '';

                bots.forEach(bot => {
                    const card = document.createElement('div');
                    card.className = 'hacker-border p-6 rounded-lg bg-black flex flex-col justify-between';
                    card.innerHTML = \`
                        <div>
                            <div class="flex justify-between items-start mb-4">
                                <h3 class="text-lg font-bold hacker-text truncate">\${bot.name}</h3>
                                <span class="text-[10px] px-2 py-0.5 rounded border \${bot.active ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'} uppercase">
                                    \${bot.active ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                            <p class="text-xs text-gray-500 mb-4">ID: \${bot.id}</p>
                            <div class="space-y-1 mb-6">
                                <p class="text-[10px] uppercase text-gray-400">Status: <span class="\${bot.status === 'Conectado' ? 'text-green-500' : 'text-yellow-500'}">\${bot.status}</span></p>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <button onclick="openBot('\${bot.id}')" class="w-full bg-gray-900 hover:bg-gray-800 text-xs py-2 rounded border border-gray-700">GERENCIAR</button>
                            <button onclick="toggleBot('\${bot.id}')" class="w-full \${bot.active ? 'bg-red-900/20 text-red-500 border-red-900' : 'bg-green-900/20 text-green-500 border-green-900'} text-xs py-2 rounded border">
                                \${bot.active ? 'DESATIVAR' : 'ATIVAR'}
                            </button>
                            <button onclick="resetBot('\${bot.id}')" class="w-full bg-orange-900/20 text-orange-500 border-orange-900 text-[10px] py-1 rounded border">RESETAR SESSÃO</button>
                            <button onclick="copyLink('\${bot.id}', '\${bot.accessToken || \'\'}')" class="w-full bg-blue-900/20 text-blue-400 border-blue-900 text-xs py-2 rounded border">COPIAR LINK ACESSO</button>
                            <button onclick="regenerateToken('\${bot.id}')" class="w-full bg-yellow-900/20 text-yellow-400 border-yellow-900 text-[10px] py-1 rounded border">REVOGAR / REGERAR TOKEN</button>
                            <button onclick="deleteBot('\${bot.id}')" class="w-full bg-red-900/40 text-red-400 border-red-900 text-[10px] py-1 rounded border hover:bg-red-900/60 mt-2">APAGAR BOT</button>
                        </div>
                    \`;
                    grid.appendChild(card);
                });
            } catch (e) {
                console.error("Erro ao buscar bots:", e);
            }
        }

        async function toggleBot(id) {
            await fetch('/api/admin/bots/' + id + '/toggle', { method: 'POST' });
            fetchBots();
        }

        async function resetBot(id) {
            if (!confirm("Isso irá desconectar o WhatsApp e gerar um novo QR Code. Continuar?")) return;
            await fetch('/api/bot/' + id + '/reset', { 
                method: 'POST',
                headers: { 'x-requested-by': 'techstar-admin' }
            });
            alert("Sessão resetada! Aguarde alguns segundos pelo novo QR Code.");
            fetchBots();
        }

        async function deleteBot(id) {
            if (!confirm("TEM CERTEZA? Isso apagará o bot e todo o histórico permanentemente!")) return;
            const res = await fetch('/api/admin/bots/' + id, { method: 'DELETE' });
            if (res.ok) {
                fetchBots();
            } else {
                const data = await res.json();
                alert("Erro ao apagar bot: " + (data.error || "Erro desconhecido"));
            }
        }

        function copyLink(id, token) {
            const url = window.location.origin + '/manage/' + id + '?token=' + encodeURIComponent(token || '');
            navigator.clipboard.writeText(url);
            alert("Link de gerenciamento copiado com token seguro!");
        }

        async function regenerateToken(id) {
            if (!confirm("Isso irá invalidar o link anterior do cliente e gerar uma nova credencial de acesso. Continuar?")) return;
            const res = await fetch('/api/admin/bots/' + id + '/regenerate-token', { method: 'POST' });
            if (res.ok) {
                alert("Token revogado e regenerado com sucesso!");
                fetchBots();
            } else {
                alert("Erro ao regenerar token.");
            }
        }

        async function openBot(id) {
            currentBotId = id;
            const res = await fetch('/api/bot/' + id + '/config', {
                headers: { 'x-requested-by': 'techstar-admin' }
            });
            const bot = await res.json();

            document.getElementById('botName').value = bot.name;
            document.getElementById('botPrompt').value = bot.systemPrompt;
            document.getElementById('botWelcome').value = bot.welcomeMsg;
            document.getElementById('botExit').value = bot.exitMsg;
            document.getElementById('botKnowledge').value = bot.knowledgeBase || "";
            document.getElementById('botKeys').value = bot.geminiKeys || "";
            document.getElementById('botOwnerName').value = bot.ownerName || "";
            document.getElementById('botOwnerNumber').value = bot.ownerPhone || bot.ownerNumber || "";
            
            document.getElementById('respondInPrivate').checked = bot.respondInPrivate === 1;
            document.getElementById('respondInGroups').checked = bot.respondInGroups === 1;
            document.getElementById('privateWelcomeEnabled').checked = bot.privateWelcomeEnabled === 1;
            document.getElementById('privateExitEnabled').checked = bot.privateExitEnabled === 1;
            
            document.getElementById('groupWelcomeEnabled').checked = bot.groupWelcomeEnabled === 1;
            document.getElementById('groupWelcomeMsg').value = bot.groupWelcomeMsg || "";
            document.getElementById('groupExitEnabled').checked = bot.groupExitEnabled === 1;
            document.getElementById('groupExitMsg').value = bot.groupExitMsg || "";
            
            document.getElementById('memoryEnabled').checked = bot.memoryEnabled === 1;
            document.getElementById('analysisEnabled').checked = bot.analysisEnabled === 1;
            document.getElementById('analysisInstructions').value = bot.analysisInstructions || "";
            
            document.getElementById('bot-modal').classList.remove('hidden');
            
            if (qrInterval) clearInterval(qrInterval);
            qrInterval = setInterval(updateQR, 3000);
            updateQR();
        }

        async function updateQR() {
            if (!currentBotId) return;
            const res = await fetch('/api/bot/' + currentBotId + '/config', {
                headers: { 'x-requested-by': 'techstar-admin' }
            });
            const bot = await res.json();
            
            const container = document.getElementById('modal-qr-container');
            const statusText = document.getElementById('bot-status-text');
            
            statusText.innerText = 'Status: ' + bot.status;
            
            if (bot.status === 'Conectado') {
                container.innerHTML = '<p class="text-green-600 font-bold text-center">BOT_CONECTADO</p>';
                statusText.className = 'mt-4 text-xs text-green-500 uppercase';
            } else if (bot.qr) {
                container.innerHTML = '<img src="' + bot.qr + '" class="w-full h-full p-2">';
            } else {
                container.innerHTML = '<p class="text-black text-[10px] text-center p-2">Aguardando QR...</p>';
            }
        }

        function closeModal() {
            document.getElementById('bot-modal').classList.add('hidden');
            currentBotId = null;
            if (qrInterval) clearInterval(qrInterval);
        }

        async function saveBotConfig() {
            const body = {
                name: document.getElementById('botName').value,
                systemPrompt: document.getElementById('botPrompt').value,
                welcomeMsg: document.getElementById('botWelcome').value,
                exitMsg: document.getElementById('botExit').value,
                knowledgeBase: document.getElementById('botKnowledge').value,
                geminiKeys: document.getElementById('botKeys').value,
                ownerName: document.getElementById('botOwnerName').value,
                ownerNumber: document.getElementById('botOwnerNumber').value,
                respondInPrivate: document.getElementById('respondInPrivate').checked,
                respondInGroups: document.getElementById('respondInGroups').checked,
                privateWelcomeEnabled: document.getElementById('privateWelcomeEnabled').checked,
                privateExitEnabled: document.getElementById('privateExitEnabled').checked,
                groupWelcomeEnabled: document.getElementById('groupWelcomeEnabled').checked,
                groupWelcomeMsg: document.getElementById('groupWelcomeMsg').value,
                groupExitEnabled: document.getElementById('groupExitEnabled').checked,
                groupExitMsg: document.getElementById('groupExitMsg').value,
                memoryEnabled: document.getElementById('memoryEnabled').checked,
                analysisEnabled: document.getElementById('analysisEnabled').checked,
                analysisInstructions: document.getElementById('analysisInstructions').value
            };
            await fetch('/api/bot/' + currentBotId + '/config', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-requested-by': 'techstar-admin'
                },
                body: JSON.stringify(body)
            });
            alert("Configuração salva!");
            fetchBots();
        }

        setInterval(fetchBots, 10000);
        fetchBots();
    </script>
</body>
</html>
    `);
});

// Client Management Page (Protected with token validation & Multi-Tenant isolation)
app.get('/manage/:id', async (req, res) => {
    const botId = req.params.id;
    const botDoc = await getDoc(doc(firestoreDb, 'bots', botId));
    const bot = botDoc.data();
    if (!bot) return res.status(404).send("Bot não encontrado");

    // Ensure bot has an access token
    if (!bot.accessToken) {
        bot.accessToken = generateSecureToken();
        await updateDoc(doc(firestoreDb, 'bots', botId), { accessToken: bot.accessToken });
    }

    const token = (req.query.token as string) || (req.headers['x-bot-token'] as string);
    const isAdmin = req.query.admin_key === (process.env.ADMIN_KEY || 'techstar_master_2024');

    // Strict multi-tenant verification: Reject if token is missing or mismatched
    if (!isAdmin && (!token || token !== bot.accessToken)) {
        await recordAuditLog(firestoreDb, {
            botId,
            role: 'USER',
            action: 'UNAUTHORIZED_MANAGE_ACCESS',
            result: 'DENIED',
            details: `Acesso negado à página /manage/${botId}. Token ausente ou inválido.`
        });

        return res.status(403).send(`
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>403 - Acesso Negado</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <style>body { font-family: 'Fira Code', monospace; background-color: #0a0a0a; color: #ff3333; }</style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <div class="max-w-md w-full border border-red-500/50 p-8 rounded-lg bg-black text-center space-y-4 shadow-[0_0_20px_rgba(255,0,0,0.3)]">
        <h1 class="text-3xl font-bold text-red-500">403_ACESSO_NEGADO</h1>
        <p class="text-sm text-gray-300">Esta instância é privada e protegida por arquitetura Multi-Tenant.</p>
        <p class="text-xs text-gray-500">Para gerenciar esta instância, utilize o link de acesso seguro com token fornecido pelo administrador da plataforma.</p>
        <div class="pt-4 border-t border-gray-800">
            <a href="/" class="text-xs text-green-500 hover:underline">Ir para o painel principal</a>
        </div>
    </div>
</body>
</html>
        `);
    }

    res.send(`
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gerenciar Bot: ${bot.name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Fira Code', monospace; background-color: #0a0a0a; color: #00ff00; }
        .hacker-border { border: 1px solid #00ff00; box-shadow: 0 0 10px #00ff00; }
        .hacker-input { background: #1a1a1a; border: 1px solid #333; color: #00ff00; }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-3xl mx-auto space-y-8">
        <div class="flex justify-between items-center border-b border-gray-800 pb-4">
            <div>
                <h1 class="text-2xl font-bold underline uppercase tracking-widest">GERENCIAMENTO_BOT: ${bot.name}</h1>
                <p class="text-xs text-gray-500 mt-1">INSTÂNCIA PRIVADA ISOLADA (MULTI-TENANT)</p>
            </div>
            <span class="text-xs px-2 py-1 rounded border border-green-500 text-green-400">SESSÃO_AUTENTICADA</span>
        </div>
        
        <div class="grid grid-cols-1 gap-8">
            <section class="hacker-border p-6 rounded-lg bg-black">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl underline">CONEXÃO_WHATSAPP</h2>
                    <button onclick="resetSession()" class="text-xs bg-orange-900/40 text-orange-400 border border-orange-500 px-3 py-1 rounded hover:bg-orange-800/60">
                        RECONECTAR / NOVO QR
                    </button>
                </div>
                <div id="qr-container" class="w-64 h-64 bg-white mx-auto flex items-center justify-center rounded mb-4">
                    <p class="text-black text-xs text-center">Carregando...</p>
                </div>
                <p id="status-text" class="text-center text-sm font-bold">STATUS: VERIFICANDO...</p>
            </section>

            <section class="hacker-border p-6 rounded-lg bg-black">
                <h2 class="text-xl mb-4 underline">CONFIGURAÇÕES_DO_BOT</h2>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs uppercase mb-1">Nome do Bot</label>
                        <input id="botName" type="text" class="w-full hacker-input p-2 rounded text-sm">
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1">Mensagem de Boas-vindas</label>
                        <input id="welcome" type="text" class="w-full hacker-input p-2 rounded text-sm">
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1">Base de Conhecimento</label>
                        <textarea id="knowledge" rows="4" class="w-full hacker-input p-2 rounded text-sm" placeholder="Instruções e dados que o bot deve usar para responder..."></textarea>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs uppercase mb-1">Nome do Proprietário</label>
                            <input id="ownerName" type="text" class="w-full hacker-input p-2 rounded text-sm" placeholder="Ex: João Silva">
                        </div>
                        <div>
                            <label class="block text-xs uppercase mb-1">Número WhatsApp do Proprietário (com DDI)</label>
                            <input id="ownerNumber" type="text" class="w-full hacker-input p-2 rounded text-sm" placeholder="Ex: 5511999999999">
                            <p class="text-[9px] text-gray-500 mt-0.5">Autoriza comandos administrativos pelo próprio WhatsApp</p>
                        </div>
                    </div>

                    <div class="hacker-border p-4 rounded bg-black/50 space-y-4">
                        <h3 class="text-xs underline uppercase">Recursos Avançados</h3>
                        <div class="flex items-center justify-between">
                            <label class="text-[10px] uppercase">Memória de Contexto</label>
                            <input id="memoryEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                        </div>
                        
                        <div class="border-t border-gray-800 pt-2">
                            <div class="flex items-center justify-between mb-2">
                                <label class="text-[10px] uppercase">Análise de Mídia (Imagem/PDF)</label>
                                <input id="analysisEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                            </div>
                            <label class="block text-[8px] uppercase mb-1">Instruções de Análise</label>
                            <textarea id="analysisInstructions" rows="2" class="w-full hacker-input p-2 rounded text-[10px]" placeholder="O que o bot deve procurar..."></textarea>
                        </div>
                    </div>

                    <div class="hacker-border p-4 rounded bg-black/50 space-y-4">
                        <h3 class="text-xs underline uppercase">Recursos de Grupo</h3>
                        
                        <div class="flex items-center justify-between">
                            <label class="text-[10px] uppercase">Boas-vindas em Grupos</label>
                            <input id="groupWelcomeEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                        </div>
                        <textarea id="groupWelcomeMsg" rows="2" class="w-full hacker-input p-2 rounded text-[10px]" placeholder="Mensagem ao entrar no grupo..."></textarea>

                        <div class="flex items-center justify-between mt-2">
                            <label class="text-[10px] uppercase">Mensagem ao Sair (Privado)</label>
                            <input id="groupExitEnabled" type="checkbox" class="w-4 h-4 accent-green-500">
                        </div>
                        <textarea id="groupExitMsg" rows="2" class="w-full hacker-input p-2 rounded text-[10px]" placeholder="Mensagem enviada no privado ao sair..."></textarea>
                    </div>

                    <button onclick="save()" class="w-full bg-green-900 text-white py-3 rounded border border-green-400 font-bold hover:bg-green-800">
                        SALVAR_ALTERAÇÕES
                    </button>
                </div>
            </section>

            <section class="hacker-border p-6 rounded-lg bg-black">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl underline">AUDITORIA_E_COMANDOS_DO_BOT</h2>
                    <button onclick="loadAuditLogs()" class="text-xs border border-green-500 px-3 py-1 rounded hover:bg-green-950">
                        ATUALIZAR_LOGS
                    </button>
                </div>
                <div id="audit-container" class="space-y-2 max-h-64 overflow-y-auto text-xs font-mono">
                    <p class="text-gray-500">Carregando logs...</p>
                </div>
            </section>
        </div>
    </div>

    <script>
        const botId = "${req.params.id}";
        const clientToken = "${token || bot.accessToken}";
        
        function getAuthUrl(endpoint) {
            return endpoint + (endpoint.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(clientToken);
        }

        async function update() {
            try {
                const res = await fetch(getAuthUrl('/api/bot/' + botId + '/config'));
                if (res.status === 403) {
                    alert("Sessão expirada ou não autorizada.");
                    return;
                }
                if (!res.ok) return;
                const data = await res.json();
                
                const container = document.getElementById('qr-container');
                const status = document.getElementById('status-text');
                
                status.innerText = 'STATUS: ' + (data.status || "DESCONHECIDO").toUpperCase();
                
                if (data.status === 'Conectado') {
                    container.innerHTML = '<p class="text-green-600 font-bold text-center">CONECTADO_COM_SUCESSO</p>';
                    status.className = 'text-center text-sm font-bold text-green-500';
                } else if (data.qr) {
                    container.innerHTML = '<img src="' + data.qr + '" class="w-full h-full p-2">';
                }
                
                if (!document.getElementById('welcome').value && data.welcomeMsg) {
                    document.getElementById('botName').value = data.name || "";
                    document.getElementById('welcome').value = data.welcomeMsg;
                    document.getElementById('knowledge').value = data.knowledgeBase || "";
                    document.getElementById('ownerName').value = data.ownerName || "";
                    document.getElementById('ownerNumber').value = data.ownerPhone || data.ownerNumber || "";
                    
                    document.getElementById('groupWelcomeEnabled').checked = data.groupWelcomeEnabled === 1;
                    document.getElementById('groupWelcomeMsg').value = data.groupWelcomeMsg || "";
                    document.getElementById('groupExitEnabled').checked = data.groupExitEnabled === 1;
                    document.getElementById('groupExitMsg').value = data.groupExitMsg || "";
                    
                    document.getElementById('memoryEnabled').checked = data.memoryEnabled === 1;
                    document.getElementById('analysisEnabled').checked = data.analysisEnabled === 1;
                    document.getElementById('analysisInstructions').value = data.analysisInstructions || "";
                }
            } catch (e) {
                console.error("Erro ao atualizar status:", e);
            }
        }

        async function save() {
            const body = {
                name: document.getElementById('botName').value,
                welcomeMsg: document.getElementById('welcome').value,
                knowledgeBase: document.getElementById('knowledge').value,
                ownerName: document.getElementById('ownerName').value,
                ownerNumber: document.getElementById('ownerNumber').value,
                groupWelcomeEnabled: document.getElementById('groupWelcomeEnabled').checked,
                groupWelcomeMsg: document.getElementById('groupWelcomeMsg').value,
                groupExitEnabled: document.getElementById('groupExitEnabled').checked,
                groupExitMsg: document.getElementById('groupExitMsg').value,
                memoryEnabled: document.getElementById('memoryEnabled').checked,
                analysisEnabled: document.getElementById('analysisEnabled').checked,
                analysisInstructions: document.getElementById('analysisInstructions').value
            };
            
            const res = await fetch(getAuthUrl('/api/bot/' + botId + '/config'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                alert("Configurações salvas com sucesso!");
                loadAuditLogs();
            } else {
                const err = await res.json();
                alert("Erro ao salvar: " + (err.error || "Acesso negado"));
            }
        }

        async function resetSession() {
            if (!confirm("Isso desconectará o WhatsApp atual e gerará um novo QR Code. Continuar?")) return;
            const res = await fetch(getAuthUrl('/api/bot/' + botId + '/reset'), { method: 'POST' });
            if (res.ok) {
                alert("Sessão resetada! Aguarde o novo QR Code aparecer na tela.");
                update();
                loadAuditLogs();
            } else {
                alert("Erro ao resetar sessão.");
            }
        }

        async function loadAuditLogs() {
            const container = document.getElementById('audit-container');
            try {
                const res = await fetch(getAuthUrl('/api/bot/' + botId + '/audit-logs'));
                if (!res.ok) return;
                const logs = await res.json();
                if (!logs || logs.length === 0) {
                    container.innerHTML = '<p class="text-gray-500">Nenhum registro de auditoria encontrado ainda.</p>';
                    return;
                }
                container.innerHTML = logs.map(function(l) {
                    var date = l.createdAt ? new Date(l.createdAt).toLocaleString('pt-BR') : 'Agora';
                    var isSuccess = l.result === 'SUCCESS';
                    var colorClass = isSuccess ? 'text-green-400' : 'text-red-400';
                    var phone = l.senderPhone ? '<span class="text-blue-400 text-[10px] ml-1">(' + l.senderPhone + ')</span>' : '';
                    return '<div class="border border-gray-800 p-2 rounded bg-black/40 flex justify-between items-start">' +
                        '<div>' +
                            '<span class="font-bold ' + colorClass + '">[' + (l.action || '') + ']</span>' +
                            '<span class="text-gray-400 ml-1">' + (l.details || l.command || '') + '</span>' +
                            phone +
                        '</div>' +
                        '<span class="text-gray-600 text-[10px] ml-2 shrink-0">' + date + '</span>' +
                    '</div>';
                }).join('');
            } catch(e) {
                container.innerHTML = '<p class="text-red-500">Erro ao carregar logs.</p>';
            }
        }

        setInterval(update, 3000);
        update();
        loadAuditLogs();
    </script>
</body>
</html>
    `);
});

async function connectWA() {
    // This function is now replaced by startBot(botId) logic
}

const PORT = 3000;

function killProcessOnPort(port: number) {
    try {
        const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
        const inodes = new Set<string>();

        for (const filePath of ['/proc/net/tcp', '/proc/net/tcp6']) {
            if (!fs.existsSync(filePath)) continue;
            const tcpData = fs.readFileSync(filePath, 'utf8');
            const lines = tcpData.split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length > 9) {
                    const localAddr = parts[1];
                    const state = parts[3]; // '0A' is TCP_LISTEN
                    if (localAddr.endsWith(':' + hexPort) && state === '0A') {
                        inodes.add(parts[9]);
                    }
                }
            }
        }

        if (inodes.size === 0) return;

        const currentPid = process.pid;
        const pids = fs.readdirSync('/proc').filter(p => /^\d+$/.test(p));
        for (const pidStr of pids) {
            const pid = parseInt(pidStr, 10);
            if (pid === currentPid) continue;
            try {
                const fdDir = `/proc/${pid}/fd`;
                if (!fs.existsSync(fdDir)) continue;
                const fds = fs.readdirSync(fdDir);
                for (const fd of fds) {
                    try {
                        const link = fs.readlinkSync(`${fdDir}/${fd}`);
                        for (const inode of inodes) {
                            if (link === `socket:[${inode}]`) {
                                console.log(`[PortManager] Liberando porta ${port}: encerrando processo órfão (PID ${pid})...`);
                                process.kill(pid, 'SIGKILL');
                                break;
                            }
                        }
                    } catch {}
                }
            } catch {}
        }
    } catch (e) {
        console.warn('[PortManager] Verificação de porta:', e);
    }
}

let server: any = null;
let retryCount = 0;
const MAX_RETRIES = 5;

function startHttpServer() {
    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Painel TechStar Multi-Bot rodando na porta ${PORT}`);
    });

    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[Server] Porta ${PORT} ocupada (EADDRINUSE). Tentativa ${retryCount + 1}/${MAX_RETRIES}...`);
            killProcessOnPort(PORT);
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                setTimeout(() => {
                    try {
                        if (server) server.close();
                    } catch {}
                    startHttpServer();
                }, 1000);
            } else {
                console.error(`[Server] Falha crítica: porta ${PORT} indisponível após ${MAX_RETRIES} tentativas.`);
                process.exit(1);
            }
        } else {
            console.error('[Server] Erro no servidor HTTP:', err);
        }
    });
}

// Limpeza de porta antes da inicialização
killProcessOnPort(PORT);
startHttpServer();

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

