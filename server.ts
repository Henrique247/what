import express from 'express';
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import { Boom } from '@hapi/boom';

const app = express();
app.use(express.json());

// Path to config
const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// Initial config load
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

let sock: any;
let qrCodeData = "";
let connectionStatus = "Desconectado";

// Gemini Setup
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Rota para atualizar a "personalidade" do bot via Front
app.post('/api/update-config', (req, res) => {
    config = { ...config, ...req.body };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    res.send({ status: "Configuração da TechStar Atualizada!" });
});

// Endpoint para o Front pegar o QR Code
app.get('/api/get-qr', (req, res) => {
    if (qrCodeData) res.send({ qr: qrCodeData });
    else res.send({ message: "Aguardando geração do QR..." });
});

// Endpoint para o status
app.get('/api/status', (req, res) => {
    res.send({ status: connectionStatus });
});

// Endpoint para pegar a config atual
app.get('/api/config', (req, res) => {
    res.send(config);
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
            <h1 class="text-3xl font-bold hacker-text">TECHSTAR_BOT_v1.0</h1>
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
                        <textarea id="systemPrompt" rows="4" class="w-full hacker-input p-2 rounded text-sm"></textarea>
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
                badge.innerText = 'Status: ' + data.status;
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
            } catch (e) {}
        }

        async function saveConfig() {
            const body = {
                systemPrompt: document.getElementById('systemPrompt').value,
                welcomeMsg: document.getElementById('welcomeMsg').value,
                exitMsg: document.getElementById('exitMsg').value
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

        setInterval(fetchStatus, 5000);
        setInterval(fetchQR, 5000);
        fetchConfig();
        fetchStatus();
        fetchQR();
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
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text) {
            try {
                const response = await genAI.models.generateContent({
                    model: "gemini-3-flash-preview",
                    contents: text,
                    config: {
                        systemInstruction: config.systemPrompt
                    }
                });
                
                const responseText = response.text;
                if (responseText) {
                    await sock.sendMessage(jid, { text: responseText });
                }
            } catch (error) {
                console.error("Erro no Gemini:", error);
            }
        }
    });
}

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Painel TechStar rodando na porta ${PORT}`);
    connectWA();
});
