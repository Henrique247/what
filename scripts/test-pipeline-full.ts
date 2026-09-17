import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, addDoc, getDocs, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import { handleWhatsAppAdminMessage } from '../src/whatsappController';
import { generateGeminiContent } from '../src/services/geminiService';
import { processGroupModeration } from '../src/services/groupModeration';
import { resolveOwnWhatsAppIdentity } from '../src/services/whatsappIdentity';
import { resolveMessageDestination } from '../src/services/whatsappPipeline';
import { classifyJid } from '../src/security';

async function runPipelineTests() {
    console.log('🚀 INICIANDO TESTES DO PIPELINE COMPLETO DO WHATSAPP & IA...\n');

    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const firestoreDb = getFirestore(app, config.firestoreDatabaseId);

    const botsSnap = await getDocs(collection(firestoreDb, 'bots'));
    if (botsSnap.empty) {
        throw new Error('Nenhum bot encontrado no Firestore');
    }
    const targetDoc = botsSnap.docs[0];
    const botId = targetDoc.id;
    let currentBot = targetDoc.data();

    // Ensure bot has basic settings
    await updateDoc(doc(firestoreDb, 'bots', botId), {
        ownerName: 'Mendes',
        ownerPhone: '942272074',
        ownerNumber: '942272074',
        ownerLid: '29596971991096@lid',
        active: 1,
        respondInGroups: 1,
        respondInPrivate: 1,
        systemPrompt: 'Você é um assistente útil e prestativo.'
    });
    currentBot = (await getDoc(doc(firestoreDb, 'bots', botId))).data()!;

    const ownerJid = '29596971991096@lid';
    const normalUserJid = '5511999998888@s.whatsapp.net';
    const groupJid = '120363413666921108@g.us';

    let passCount = 0;
    let failCount = 0;

    function assert(condition: boolean, title: string, details?: string) {
        if (condition) {
            console.log(`  ✅ [PASS] ${title}`);
            passCount++;
        } else {
            console.error(`  ❌ [FAIL] ${title} - ${details || ''}`);
            failCount++;
        }
    }

    const sentMessages: { jid: string; text: string }[] = [];
    const mockSock = {
        user: { id: '244900000000:1@s.whatsapp.net', lid: '10000000000000@lid' },
        sendMessage: async (jid: string, payload: any) => {
            sentMessages.push({ jid, text: payload.text || '' });
            return { key: { id: 'mock_' + Date.now() } };
        },
        groupMetadata: async (jid: string) => {
            return {
                id: jid,
                subject: 'Grupo de Testes',
                participants: [
                    { id: '244900000000@s.whatsapp.net', admin: 'admin' },
                    { id: normalUserJid, admin: null }
                ]
            };
        }
    };

    // --- TESTE 1: CLASSIFICAÇÃO DE JID ---
    console.log('🔹 1. TESTE: Classificação de JID');
    assert(classifyJid(ownerJid) === 'LID', 'Identifica LID corretamente');
    assert(classifyJid(normalUserJid) === 'PRIVATE_PN', 'Identifica PRIVATE_PN');
    assert(classifyJid(groupJid) === 'GROUP', 'Identifica GROUP');

    // --- TESTE 2: RESOLUÇÃO DE DESTINO ---
    console.log('\n🔹 2. TESTE: Resolução de Destino');
    const destGroup = await resolveMessageDestination({
        key: { remoteJid: groupJid, participant: normalUserJid }
    }, botId, mockSock);
    assert(destGroup.destinationJid === groupJid, 'Destino de grupo é SEMPRE o remoteJid do grupo (@g.us)');

    const destPrivate = await resolveMessageDestination({
        key: { remoteJid: normalUserJid }
    }, botId, mockSock);
    assert(destPrivate.destinationJid === normalUserJid, 'Destino privado é o remoteJid do remetente');

    // --- TESTE 3: COMANDO ADMINISTRATIVO /status NÃO DEPENDE DA IA ---
    console.log('\n🔹 3. TESTE: Comando administrativo (/status) funciona offline de IA');
    sentMessages.length = 0;
    const adminRes = await handleWhatsAppAdminMessage({
        sock: mockSock,
        botId,
        currentBot,
        senderJid: ownerJid,
        senderLid: ownerJid,
        text: '/status',
        firestoreDb,
        isGroup: false
    });
    assert(adminRes.handled === true, 'Comando /status interceptado como admin');
    assert(sentMessages[0]?.text.includes('STATUS DO BOT'), 'Status retornado com sucesso');

    // --- TESTE 4: MENSAGEM CONVERSACIONAL DE USUÁRIO COMUM NÃO É INTERCEPTADA POR ADMIN ---
    console.log('\n🔹 4. TESTE: Mensagem conversacional normal não é interceptada como admin');
    const userMsgRes = await handleWhatsAppAdminMessage({
        sock: mockSock,
        botId,
        currentBot,
        senderJid: normalUserJid,
        text: 'Qual é a capital da França?',
        firestoreDb,
        isGroup: false
    });
    assert(userMsgRes.handled === false, 'Mensagem comum passa direto para pipeline de IA');

    // --- TESTE 5: MODERAÇÃO DE GRUPO PERMITE PROCESSAR IA ---
    console.log('\n🔹 5. TESTE: Moderação de grupo permite prosseguir para IA');
    const modResult = await processGroupModeration({
        sock: mockSock,
        botId,
        currentBot,
        groupId: groupJid,
        senderJid: normalUserJid,
        messageKey: { id: 'msg_123' },
        rawText: 'Olá bot, como funciona o serviço?',
        messageObj: { conversation: 'Olá bot, como funciona o serviço?' },
        firestoreDb
    });
    assert(modResult.blocked === false, 'Mensagem não bloqueada por moderação');
    assert(modResult.shouldProceedToAI === true, 'shouldProceedToAI é true');

    // --- TESTE 6: GERADOR GEMINI CENTRALIZADO COM FALLBACK & TRATAMENTO DE ERROS ---
    console.log('\n🔹 6. TESTE: Geração de resposta Gemini');
    const aiResult = await generateGeminiContent({
        botId,
        geminiKeysStr: currentBot.geminiKeys || currentBot.geminiKey || process.env.GEMINI_API_KEY,
        prompt: 'Responda apenas "TESTE_OK" em uma única palavra.',
        firestoreDb
    });
    assert(aiResult.success === true, 'Geração Gemini completada com sucesso');
    assert(aiResult.text !== null && aiResult.text.length > 0, 'Gemini retornou texto');
    assert(aiResult.usedKeyMasked.startsWith('AQ.') || aiResult.usedKeyMasked.startsWith('AIza'), 'Chave usada foi devidamente mascarada');

    console.log('\n========================================');
    console.log(`🏁 RESULTADO DO PIPELINE: ${passCount} PASSOU / ${failCount} FALHOU`);
    console.log('========================================\n');

    process.exit(failCount === 0 ? 0 : 1);
}

runPipelineTests().catch(err => {
    console.error('ERRO FATAL NO PIPELINE:', err);
    process.exit(1);
});
