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
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, serverTimestamp, writeBatch, FieldValue, Timestamp } from 'firebase/firestore';
import Database from 'better-sqlite3';

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

const app = express();
app.use(express.json());

// Firebase Setup
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

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

            const fullSystemPrompt = `${currentBot.systemPrompt}\n\nBASE DE CONHECIMENTO:\n${currentBot.knowledgeBase || "Nenhuma"}`;
            
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
                await sock.sendMessage(jid, { text: responseText });
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

// API Routes for Multi-Bot
app.get('/api/admin/bots', async (req, res) => {
    const q = query(collection(firestoreDb, 'bots'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const bots = snapshot.docs.map(doc => doc.data());
    res.send(bots.map((b: any) => ({
        ...b,
        status: connectionStatuses.get(b.id) || "Desconectado",
        hasQR: !!qrCodes.get(b.id)
    })));
});

app.post('/api/admin/bots', async (req, res) => {
    const { name } = req.body;
    const id = Math.random().toString(36).substring(2, 10);
    const botData = {
        id,
        name,
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
        analysisInstructions: "Analise esta imagem ou documento detalhadamente. Procure por informações relevantes e descreva o que vê."
    };
    
    await setDoc(doc(firestoreDb, 'bots', id), botData);
    
    console.log(`[Admin] Criando e iniciando bot: ${name} (${id})`);
    startBot(id);
    
    res.send({ id, status: "Bot criado e iniciando..." });
});

app.post('/api/admin/bots/:id/toggle', async (req, res) => {
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
    res.send({ status: newState ? "Bot ativado" : "Bot desativado" });
});

app.get('/api/bot/:id/config', async (req, res) => {
    const botDoc = await getDoc(doc(firestoreDb, 'bots', req.params.id));
    const bot = botDoc.data();
    if (!bot) return res.status(404).send({ error: "Bot não encontrado" });
    res.send({
        ...bot,
        status: connectionStatuses.get(req.params.id) || "Desconectado",
        qr: qrCodes.get(req.params.id) || null
    });
});

app.post('/api/bot/:id/config', async (req, res) => {
    const { 
        name, systemPrompt, welcomeMsg, exitMsg, knowledgeBase, geminiKeys,
        groupWelcomeEnabled, groupWelcomeMsg, groupExitEnabled, groupExitMsg,
        respondInGroups, respondInPrivate, privateWelcomeEnabled, privateExitEnabled,
        memoryEnabled, analysisEnabled, analysisInstructions
    } = req.body;
    
    const botRef = doc(firestoreDb, 'bots', req.params.id);
    
    await updateDoc(botRef, {
        name, systemPrompt, welcomeMsg, exitMsg, knowledgeBase, geminiKeys,
        groupWelcomeEnabled: groupWelcomeEnabled ? 1 : 0,
        groupWelcomeMsg,
        groupExitEnabled: groupExitEnabled ? 1 : 0,
        groupExitMsg,
        respondInGroups: respondInGroups ? 1 : 0,
        respondInPrivate: respondInPrivate ? 1 : 0,
        privateWelcomeEnabled: privateWelcomeEnabled ? 1 : 0,
        privateExitEnabled: privateExitEnabled ? 1 : 0,
        memoryEnabled: memoryEnabled ? 1 : 0,
        analysisEnabled: analysisEnabled ? 1 : 0,
        analysisInstructions
    });
    res.send({ status: "Configuração salva!" });
});

app.post('/api/bot/:id/reset', async (req, res) => {
    const botId = req.params.id;
    console.log(`[Admin] Resetando sessão do bot: ${botId}`);
    
    // Stop bot if running
    if (activeSocks.has(botId)) {
        try { activeSocks.get(botId).logout(); } catch(e) {}
        activeSocks.delete(botId);
    }
    
    // Delete auth folder
    const authPath = path.join(process.cwd(), 'auth_info', `bot_${botId}`);
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
    }
    
    // Restart bot
    startingBots.delete(botId);
    qrCodes.delete(botId);
    connectionStatuses.set(botId, "Reiniciando...");
    startBot(botId);
    res.send({ status: "Sessão resetada e bot reiniciado!" });
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
    const q = query(collection(firestoreDb, 'bots'), where('active', '==', 1));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(doc => startBot(doc.id));
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
            const res = await fetch('/api/admin/bots');
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
                        <button onclick="copyLink('\${bot.id}')" class="w-full bg-blue-900/20 text-blue-400 border-blue-900 text-xs py-2 rounded border">COPIAR LINK ACESSO</button>
                        <button onclick="deleteBot('\${bot.id}')" class="w-full bg-red-900/40 text-red-400 border-red-900 text-[10px] py-1 rounded border hover:bg-red-900/60 mt-2">APAGAR BOT</button>
                    </div>
                \`;
                grid.appendChild(card);
            });
        }

        async function toggleBot(id) {
            await fetch('/api/admin/bots/' + id + '/toggle', { method: 'POST' });
            fetchBots();
        }

        async function resetBot(id) {
            if (!confirm("Isso irá desconectar o WhatsApp e gerar um novo QR Code. Continuar?")) return;
            await fetch('/api/bot/' + id + '/reset', { method: 'POST' });
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

        function copyLink(id) {
            const url = window.location.origin + '/manage/' + id;
            navigator.clipboard.writeText(url);
            alert("Link de gerenciamento copiado!");
        }

        async function openBot(id) {
            currentBotId = id;
            const res = await fetch('/api/bot/' + id + '/config');
            const bot = await res.json();

            document.getElementById('botName').value = bot.name;
            document.getElementById('botPrompt').value = bot.systemPrompt;
            document.getElementById('botWelcome').value = bot.welcomeMsg;
            document.getElementById('botExit').value = bot.exitMsg;
            document.getElementById('botKnowledge').value = bot.knowledgeBase || "";
            document.getElementById('botKeys').value = bot.geminiKeys || "";
            
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
            const res = await fetch('/api/bot/' + currentBotId + '/config');
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
                headers: { 'Content-Type': 'application/json' },
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

// Client Management Page
app.get('/manage/:id', async (req, res) => {
    const botDoc = await getDoc(doc(firestoreDb, 'bots', req.params.id));
    const bot = botDoc.data();
    if (!bot) return res.status(404).send("Bot não encontrado");

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
    <div class="max-w-2xl mx-auto">
        <h1 class="text-2xl font-bold mb-8 underline uppercase tracking-widest">GERENCIAMENTO_BOT: ${bot.name}</h1>
        
        <div class="grid grid-cols-1 gap-8">
            <section class="hacker-border p-6 rounded-lg bg-black">
                <h2 class="text-xl mb-4 underline">WHATSAPP_LINK</h2>
                <div id="qr-container" class="w-64 h-64 bg-white mx-auto flex items-center justify-center rounded mb-4">
                    <p class="text-black text-xs text-center">Carregando...</p>
                </div>
                <p id="status-text" class="text-center text-sm font-bold">STATUS: VERIFICANDO...</p>
            </section>

            <section class="hacker-border p-6 rounded-lg bg-black">
                <h2 class="text-xl mb-4 underline">CONFIGURAÇÕES_RÁPIDAS</h2>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs uppercase mb-1">Mensagem de Boas-vindas</label>
                        <input id="welcome" type="text" class="w-full hacker-input p-2 rounded text-sm">
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1">Base de Conhecimento</label>
                        <textarea id="knowledge" rows="4" class="w-full hacker-input p-2 rounded text-sm"></textarea>
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

                    <button onclick="save()" class="w-full bg-green-900 text-white py-2 rounded border border-green-400 font-bold">SALVAR_ALTERAÇÕES</button>
                </div>
            </section>
        </div>
    </div>

    <script>
        const botId = "${req.params.id}";
        
        async function update() {
            const res = await fetch('/api/bot/' + botId + '/config');
            const data = await res.json();
            
            const container = document.getElementById('qr-container');
            const status = document.getElementById('status-text');
            
            status.innerText = 'STATUS: ' + data.status.toUpperCase();
            
            if (data.status === 'Conectado') {
                container.innerHTML = '<p class="text-green-600 font-bold">CONECTADO_COM_SUCESSO</p>';
                status.className = 'text-center text-sm font-bold text-green-500';
            } else if (data.qr) {
                container.innerHTML = '<img src="' + data.qr + '" class="w-full h-full p-2">';
            }
            
            if (!document.getElementById('welcome').value) {
                document.getElementById('welcome').value = data.welcomeMsg;
                document.getElementById('knowledge').value = data.knowledgeBase || "";
                
                document.getElementById('groupWelcomeEnabled').checked = data.groupWelcomeEnabled === 1;
                document.getElementById('groupWelcomeMsg').value = data.groupWelcomeMsg || "";
                document.getElementById('groupExitEnabled').checked = data.groupExitEnabled === 1;
                document.getElementById('groupExitMsg').value = data.groupExitMsg || "";
                
                document.getElementById('memoryEnabled').checked = data.memoryEnabled === 1;
                document.getElementById('analysisEnabled').checked = data.analysisEnabled === 1;
                document.getElementById('analysisInstructions').value = data.analysisInstructions || "";
            }
        }

        async function save() {
            const res = await fetch('/api/bot/' + botId + '/config');
            const current = await res.json();
            
            const body = {
                ...current,
                welcomeMsg: document.getElementById('welcome').value,
                knowledgeBase: document.getElementById('knowledge').value,
                groupWelcomeEnabled: document.getElementById('groupWelcomeEnabled').checked,
                groupWelcomeMsg: document.getElementById('groupWelcomeMsg').value,
                groupExitEnabled: document.getElementById('groupExitEnabled').checked,
                groupExitMsg: document.getElementById('groupExitMsg').value,
                memoryEnabled: document.getElementById('memoryEnabled').checked,
                analysisEnabled: document.getElementById('analysisEnabled').checked,
                analysisInstructions: document.getElementById('analysisInstructions').value
            };
            
            await fetch('/api/bot/' + botId + '/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            alert("Salvo!");
        }

        setInterval(update, 3000);
        update();
    </script>
</body>
</html>
    `);
});

async function connectWA() {
    // This function is now replaced by startBot(botId) logic
}

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Painel TechStar Multi-Bot rodando na porta ${PORT}`);
});
