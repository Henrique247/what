import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import { Boom } from '@hapi/boom';
import Database from 'better-sqlite3';

const app = express();
app.use(express.json());

// Database Setup
const db = new Database('bot_data.db');
db.exec(`
    CREATE TABLE IF NOT EXISTS history (
        jid TEXT,
        role TEXT,
        text TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

function saveMessage(jid: string, role: 'user' | 'model', text: string) {
    const stmt = db.prepare('INSERT INTO history (jid, role, text) VALUES (?, ?, ?)');
    stmt.run(jid, role, text);
    
    // Keep only last 20 messages per conversation to save tokens and memory
    db.prepare(`
        DELETE FROM history 
        WHERE jid = ? AND timestamp NOT IN (
            SELECT timestamp FROM history WHERE jid = ? ORDER BY timestamp DESC LIMIT 20
        )
    `).run(jid, jid);
}

function getHistory(jid: string) {
    const rows = db.prepare('SELECT role, text FROM history WHERE jid = ? ORDER BY timestamp ASC').all(jid);
    return rows.map((r: any) => ({
        role: r.role,
        parts: [{ text: r.text }]
    }));
}

// Path to config
const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// Initial config load
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

let sock: any;
let qrCodeData = "";
let connectionStatus = "Desconectado";

// Gemini Setup
let genAIs: any[] = [];
let currentKeyIndex = 0;

function updateGemini() {
    const keys = Array.isArray(config.geminiKeys) 
        ? config.geminiKeys 
        : (config.geminiKey ? [config.geminiKey] : []);
    
    genAIs = keys.map((k: string) => {
        const cleanKey = k.trim().replace(/["']/g, '');
        return cleanKey ? new GoogleGenAI({ apiKey: cleanKey }) : null;
    }).filter(ai => ai !== null);

    currentKeyIndex = 0;

    if (genAIs.length > 0) {
        console.log(`SUCESSO: ${genAIs.length} chaves Gemini configuradas.`);
    } else {
        console.warn("AVISO: Nenhuma chave Gemini configurada!");
    }
}

updateGemini();

// Rota para atualizar a "personalidade" do bot via Front
app.post('/api/update-config', (req, res) => {
    config = { ...config, ...req.body };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    updateGemini();
    res.send({ status: "Configuração da TechStar Atualizada!" });
});

// Endpoint para o Front pegar o QR Code
app.get('/api/get-qr', (req, res) => {
    if (qrCodeData) res.send({ qr: qrCodeData });
    else res.send({ message: "Aguardando geração do QR..." });
});

// Endpoint para o status
app.get('/api/status', (req, res) => {
    const keysCount = genAIs.length;
    res.send({ 
        status: connectionStatus,
        geminiKey: keysCount > 0 ? `${keysCount} Chave(s) Ativa(s)` : "NENHUMA ENCONTRADA"
    });
});

// Endpoint para pegar a config atual
app.get('/api/config', (req, res) => {
    res.send(config);
});

// Endpoint para listar chats únicos
app.get('/api/chats', (req, res) => {
    try {
        const rows = db.prepare('SELECT jid, MAX(timestamp) as last_msg FROM history GROUP BY jid ORDER BY last_msg DESC').all();
        res.send(rows);
    } catch (e) {
        res.status(500).send({ error: "Erro ao buscar chats" });
    }
});

// Endpoint para pegar mensagens de um chat específico
app.get('/api/chat/:jid', (req, res) => {
    try {
        const rows = db.prepare('SELECT role, text, timestamp FROM history WHERE jid = ? ORDER BY timestamp ASC').all(req.params.jid);
        res.send(rows);
    } catch (e) {
        res.status(500).send({ error: "Erro ao buscar histórico" });
    }
});

// Endpoint para análise de IA sobre os chats
app.get('/api/analyze-chats', async (req, res) => {
    try {
        if (genAIs.length === 0) return res.status(400).send({ error: "Sem chaves Gemini" });
        
        const recentMessages = db.prepare('SELECT jid, role, text FROM history ORDER BY timestamp DESC LIMIT 100').all();
        if (recentMessages.length === 0) return res.send({ summary: "Nenhuma conversa registrada ainda." });

        const prompt = `Analise as seguintes conversas recentes do bot de WhatsApp da TechStar e forneça um resumo executivo dos principais tópicos, sentimentos dos clientes e possíveis melhorias ou oportunidades de negócio. Seja direto e profissional.\n\nCONVERSAS:\n${JSON.stringify(recentMessages)}`;

        const currentAI = genAIs[0];
        const result = await currentAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        res.send({ summary: result.text });
    } catch (e: any) {
        res.status(500).send({ error: e.message });
    }
});

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
    <title>TechStar Admin Panel</title>
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
    <div class="max-w-4xl mx-auto">
        <header class="mb-8 flex justify-between items-center border-b border-gray-800 pb-4">
            <div>
                <h1 class="text-3xl font-bold hacker-text">TECHSTAR_BOT_v1.0</h1>
                <p id="gemini-status" class="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">IA_KEY: Verificando...</p>
            </div>
            <div id="status-badge" class="px-4 py-1 rounded-full border border-red-500 text-red-500 text-sm uppercase tracking-widest">
                Status: Desconectado
            </div>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- QR Code Section -->
            <section class="hacker-border p-6 rounded-lg bg-black">
                <h2 class="text-xl mb-4 hacker-text underline">AUTENTICAÇÃO_WHATSAPP</h2>
                <div id="qr-container" class="flex flex-col items-center justify-center min-h-[250px] border border-dashed border-gray-700 rounded">
                    <p id="qr-placeholder" class="text-gray-500 text-center px-4">Aguardando sinal do servidor...</p>
                    <img id="qr-image" class="hidden w-64 h-64 bg-white p-2 rounded" src="" alt="QR Code">
                </div>
                <p class="mt-4 text-xs text-gray-500 italic">Escaneie o código acima para vincular o bot.</p>
            </section>

            <!-- Config Section -->
            <section class="hacker-border p-6 rounded-lg bg-black">
                <h2 class="text-xl mb-4 hacker-text underline">CONFIGURAÇÃO_COMPORTAMENTO</h2>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">System Prompt (IA)</label>
                        <textarea id="systemPrompt" rows="3" class="w-full hacker-input p-2 rounded text-sm"></textarea>
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Base de Conhecimento (Treinamento)</label>
                        <textarea id="knowledgeBase" rows="5" class="w-full hacker-input p-2 rounded text-sm" placeholder="Insira aqui informações sobre a TechStar, produtos, preços, etc..."></textarea>
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Gemini API Keys (Separe por vírgula para rotação)</label>
                        <textarea id="geminiKeys" rows="2" class="w-full hacker-input p-2 rounded text-sm" placeholder="Chave 1, Chave 2, Chave 3..."></textarea>
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Mensagem de Boas-vindas</label>
                        <input id="welcomeMsg" type="text" class="w-full hacker-input p-2 rounded text-sm">
                    </div>
                    <div>
                        <label class="block text-xs uppercase mb-1 hacker-text">Mensagem de Saída</label>
                        <input id="exitMsg" type="text" class="w-full hacker-input p-2 rounded text-sm">
                    </div>
                    <button onclick="saveConfig()" class="w-full bg-green-900 hover:bg-green-700 text-white font-bold py-2 rounded transition-all border border-green-400">
                        SALVAR_ALTERAÇÕES
                    </button>
                </div>
            </section>
        </div>

        <!-- Analytics & History Section -->
        <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            <!-- Chat List -->
            <section class="hacker-border p-6 rounded-lg bg-black md:col-span-1">
                <h2 class="text-xl mb-4 hacker-text underline">CONVERSAS_RECENTES</h2>
                <div id="chat-list" class="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    <p class="text-gray-500 text-xs text-center">Nenhum chat encontrado.</p>
                </div>
            </section>

            <!-- Chat Viewer -->
            <section class="hacker-border p-6 rounded-lg bg-black md:col-span-2">
                <h2 class="text-xl mb-4 hacker-text underline">VISUALIZADOR_DE_CHAT</h2>
                <div id="chat-viewer" class="h-[350px] overflow-y-auto border border-gray-800 p-4 rounded bg-[#050505] space-y-4 mb-4">
                    <p class="text-gray-500 text-center mt-20">Selecione uma conversa ao lado.</p>
                </div>
                <div id="ai-analysis-container" class="hidden p-4 border border-blue-900 bg-blue-900/10 rounded">
                    <h3 class="text-blue-400 text-xs font-bold uppercase mb-2">Insights da IA (Gemini)</h3>
                    <div id="ai-summary" class="text-sm text-blue-200 italic"></div>
                </div>
                <button onclick="analyzeChats()" class="mt-4 w-full bg-blue-900 hover:bg-blue-700 text-white font-bold py-2 rounded transition-all border border-blue-400">
                    GERAR_INSIGHTS_IA
                </button>
            </section>
        </div>

        <footer class="mt-12 text-center text-gray-600 text-xs">
            &copy; 2024 TECHSTAR INDUSTRIES - ALL RIGHTS RESERVED
        </footer>
    </div>

    <script>
        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                const badge = document.getElementById('status-badge');
                const geminiStatus = document.getElementById('gemini-status');
                
                badge.innerText = 'Status: ' + data.status;
                geminiStatus.innerText = 'IA_KEY: ' + data.geminiKey;

                if (data.geminiKey.includes('NÃO ENCONTRADA')) {
                    geminiStatus.classList.add('text-red-500');
                    geminiStatus.classList.remove('text-gray-500');
                } else {
                    geminiStatus.classList.add('text-green-500');
                    geminiStatus.classList.remove('text-gray-500', 'text-red-500');
                }

                if (data.status === 'Conectado') {
                    badge.classList.remove('border-red-500', 'text-red-500');
                    badge.classList.add('border-green-500', 'text-green-500');
                    document.getElementById('qr-container').innerHTML = '<p class="text-green-500 font-bold">BOT_ONLINE</p>';
                }
            } catch (e) {}
        }

        async function fetchQR() {
            try {
                const res = await fetch('/api/get-qr');
                const data = await res.json();
                const img = document.getElementById('qr-image');
                const placeholder = document.getElementById('qr-placeholder');
                
                if (data.qr) {
                    img.src = data.qr;
                    img.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                }
            } catch (e) {}
        }

        async function fetchConfig() {
            try {
                const res = await fetch('/api/config');
                const data = await res.json();
                document.getElementById('systemPrompt').value = data.systemPrompt;
                document.getElementById('welcomeMsg').value = data.welcomeMsg;
                document.getElementById('exitMsg').value = data.exitMsg;
                
                const keys = data.geminiKeys ? data.geminiKeys.join(', ') : (data.geminiKey || "");
                document.getElementById('geminiKeys').value = keys;
                
                document.getElementById('knowledgeBase').value = data.knowledgeBase || "";
            } catch (e) {}
        }

        async function saveConfig() {
            const keysRaw = document.getElementById('geminiKeys').value;
            const keysArray = keysRaw.split(',').map(k => k.trim()).filter(k => k !== "");

            const body = {
                systemPrompt: document.getElementById('systemPrompt').value,
                welcomeMsg: document.getElementById('welcomeMsg').value,
                exitMsg: document.getElementById('exitMsg').value,
                geminiKeys: keysArray,
                knowledgeBase: document.getElementById('knowledgeBase').value
            };
            try {
                const res = await fetch('/api/update-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                alert(data.status);
            } catch (e) {
                alert('Erro ao salvar configuração');
            }
        }

        async function fetchChats() {
            try {
                const res = await fetch('/api/chats');
                const data = await res.json();
                const list = document.getElementById('chat-list');
                list.innerHTML = '';
                
                if (data.length === 0) {
                    list.innerHTML = '<p class="text-gray-500 text-xs text-center">Nenhum chat encontrado.</p>';
                    return;
                }

                data.forEach(chat => {
                    const btn = document.createElement('button');
                    btn.className = 'w-full text-left p-2 border border-gray-800 rounded hover:border-green-500 transition-all text-xs truncate';
                    btn.innerText = chat.jid.split('@')[0];
                    btn.onclick = () => loadChat(chat.jid);
                    list.appendChild(btn);
                });
            } catch (e) {}
        }

        async function loadChat(jid) {
            try {
                const res = await fetch('/api/chat/' + encodeURIComponent(jid));
                const data = await res.json();
                const viewer = document.getElementById('chat-viewer');
                viewer.innerHTML = '';
                
                data.forEach(msg => {
                    const div = document.createElement('div');
                    const isBot = msg.role === 'model';
                    div.className = 'max-w-[80%] p-2 rounded text-xs ' + (isBot ? 'ml-auto bg-green-900/20 border border-green-900/50' : 'mr-auto bg-gray-800');
                    
                    const time = new Date(msg.timestamp).toLocaleString();
                    const roleName = isBot ? 'TECHSTAR_BOT' : 'USER';
                    const roleClass = isBot ? 'text-green-400' : 'text-blue-400';
                    
                    div.innerHTML = 
                        '<p class="font-bold mb-1 ' + roleClass + '">' + roleName + '</p>' +
                        '<p>' + msg.text + '</p>' +
                        '<p class="text-[8px] text-gray-500 mt-1 text-right">' + time + '</p>';
                    
                    viewer.appendChild(div);
                });
                viewer.scrollTop = viewer.scrollHeight;
            } catch (e) {}
        }

        async function analyzeChats() {
            const container = document.getElementById('ai-analysis-container');
            const summary = document.getElementById('ai-summary');
            summary.innerText = "Analisando conversas com Gemini...";
            container.classList.remove('hidden');

            try {
                const res = await fetch('/api/analyze-chats');
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                summary.innerText = data.summary;
            } catch (e) {
                summary.innerText = "Erro na análise: " + e.message;
            }
        }

        setInterval(fetchStatus, 5000);
        setInterval(fetchQR, 5000);
        setInterval(fetchChats, 10000);
        fetchConfig();
        fetchStatus();
        fetchQR();
        fetchChats();
    </script>
</body>
</html>
    `);
});

async function connectWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ["TechStar Bot", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrcode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
        }

        if (connection === 'close') {
            connectionStatus = "Desconectado";
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Reconectando...', shouldReconnect);
            if (shouldReconnect) connectWA();
        } else if (connection === 'open') {
            connectionStatus = "Conectado";
            qrCodeData = "";
            console.log('Conexão aberta com sucesso!');
        }
    });

    // Lógica de Grupos
    sock.ev.on('group-participants.update', async (anu: any) => {
        const { id, participants, action } = anu;
        const metadata = await sock.groupMetadata(id);

        for (const num of participants) {
            if (action === 'add') {
                // Boas-vindas no grupo
                await sock.sendMessage(id, { text: config.welcomeMsg });
                // Mensagem no privado
                await sock.sendMessage(num, { text: `Olá! ${config.welcomeMsg}` });
            } else if (action === 'remove') {
                // Feedback no privado
                await sock.sendMessage(num, { text: config.exitMsg });
            }
        }
    });

    // Resposta Inteligente com Gemini
    sock.ev.on('messages.upsert', async (m: any) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        
        if (!sock.user) {
            console.warn("[WARN] Mensagem recebida mas sock.user ainda não está definido.");
            return;
        }

        const botFullId = sock.user.id;
        const botNumber = botFullId.split(':')[0].split('@')[0];
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // Lógica de Menção em Grupos
        if (isGroup) {
            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
            const mentions = contextInfo?.mentionedJid || [];
            const isReplyToBot = contextInfo?.participant?.includes(botNumber);
            const hasMentionMetadata = mentions.some((m: string) => m.includes(botNumber));
            const hasTextMention = text.includes(`@${botNumber}`);
            
            console.log(`[DEBUG] Grupo: ${jid} | BotNum: ${botNumber} | Mentions: ${mentions} | ReplyToBot: ${isReplyToBot} | Text: ${text}`);

            if (!hasMentionMetadata && !hasTextMention && !isReplyToBot) return;
        }

        if (text) {
            try {
                if (genAIs.length === 0) {
                    await sock.sendMessage(jid, { text: "⚠️ Erro: Nenhuma chave Gemini configurada no Painel Admin." });
                    return;
                }

                // Retry logic for 503 and 429 errors with rotation
                let attempts = 0;
                const maxAttempts = genAIs.length * 2; // Allow rotating through all keys twice
                let response;

                const fullSystemPrompt = `${config.systemPrompt}\n\nBASE DE CONHECIMENTO:\n${config.knowledgeBase || "Nenhuma informação adicional fornecida."}\n\nIMPORTANTE: Seja natural, humano e lembre-se do contexto da conversa acima. Não repita informações que já foram ditas se não for necessário.`;

                const history = getHistory(jid);
                saveMessage(jid, 'user', text); // Save current user message to history

                while (attempts < maxAttempts) {
                    try {
                        const currentAI = genAIs[currentKeyIndex];
                        response = await currentAI.models.generateContent({
                            model: "gemini-3-flash-preview",
                            contents: [...history, { role: 'user', parts: [{ text }] }],
                            config: {
                                systemInstruction: fullSystemPrompt
                            }
                        });
                        break; // Success!
                    } catch (err: any) {
                        attempts++;
                        const is503 = err.message?.includes("503");
                        const is429 = err.message?.includes("429") || err.message?.includes("quota");
                        
                        if (is429) {
                            console.warn(`[ROTATION] Chave ${currentKeyIndex + 1} atingiu limite. Rotacionando...`);
                            currentKeyIndex = (currentKeyIndex + 1) % genAIs.length;
                            // No delay for rotation, just try next key
                            continue;
                        }

                        if (is503 && attempts < maxAttempts) {
                            const delay = 2000 * attempts;
                            console.warn(`Gemini 503 - Tentativa ${attempts}. Aguardando ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                        throw err;
                    }
                }
                
                const responseText = response?.text;
                if (responseText) {
                    saveMessage(jid, 'model', responseText); // Save bot response to history
                    await sock.sendMessage(jid, { text: responseText });
                }
            } catch (error: any) {
                console.error("Erro no Gemini:", error);
                let errorMsg = "⚠️ Erro na IA: Ocorreu um problema ao processar sua mensagem.";
                
                if (error.message?.includes("503") || error.message?.includes("UNAVAILABLE")) {
                    errorMsg = "⚠️ O Google está com alta demanda no momento. Por favor, tente novamente em alguns instantes.";
                } else if (error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
                    errorMsg = "⚠️ Limite de Uso Atingido: Você atingiu o limite de mensagens gratuitas do Google Gemini. Por favor, aguarde alguns minutos ou considere usar uma chave de API com plano pago.";
                } else if (error.message?.includes("API key was reported as leaked") || error.message?.includes("leaked")) {
                    errorMsg = "⚠️ Erro Crítico: Sua chave de API do Gemini foi exposta e bloqueada pelo Google. Por favor, gere uma NOVA chave e atualize no Painel Admin.";
                } else if (error.message?.includes("API key not valid")) {
                    errorMsg = "⚠️ Erro: A chave de API do Gemini é inválida. Verifique a chave no seu Painel Admin.";
                }
                
                await sock.sendMessage(jid, { text: errorMsg });
            }
        }
    });
}

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Painel TechStar rodando na porta ${PORT}`);
    connectWA().catch(err => {
        console.error("Erro fatal ao iniciar WhatsApp:", err);
    });
});
