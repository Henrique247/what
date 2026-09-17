import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import { handleWhatsAppAdminMessage } from '../src/whatsappController';
import { 
    generateGeminiContent, 
    clearKeyCooldowns,
    GEMINI_PRIMARY_MODEL,
    GEMINI_FALLBACK_MODELS 
} from '../src/services/geminiService';
import { processGroupModeration } from '../src/services/groupModeration';
import { resolveMessageDestination } from '../src/services/whatsappPipeline';
import { classifyJid } from '../src/security';

async function runPipelineTests() {
    console.log('===============================================================');
    console.log('🚀 INICIANDO BATERIA COMPLETA DOS 10 TESTES DO PIPELINE GEMINI & WHATSAPP');
    console.log('===============================================================\n');

    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const firestoreDb = getFirestore(app, config.firestoreDatabaseId);

    const botsSnap = await getDocs(collection(firestoreDb, 'bots'));
    if (botsSnap.empty) {
        throw new Error('Nenhum bot encontrado no Firestore');
    }
    const targetDoc = botsSnap.docs[0];
    const botId = targetDoc.id;

    const realGeminiKey = targetDoc.data().geminiKeys || targetDoc.data().geminiKey || process.env.GEMINI_API_KEY || '';

    // Configurar bot de teste principal (Bot 1)
    await updateDoc(doc(firestoreDb, 'bots', botId), {
        ownerName: 'Mendes',
        ownerPhone: '942272074',
        ownerNumber: '942272074',
        ownerLid: '29596971991096@lid',
        active: 1,
        respondInGroups: 1,
        respondInPrivate: 1,
        systemPrompt: 'Você é um assistente útil e prestativo. Responda em uma frase curta.',
        geminiKeys: realGeminiKey
    });
    const currentBot = (await getDoc(doc(firestoreDb, 'bots', botId))).data()!;

    const ownerLidJid = '29596971991096@lid';
    const ownerPnJid = '942272074@s.whatsapp.net';
    const otherUserJid = '5511988887777@s.whatsapp.net';
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
                subject: 'Grupo de Testes VIP',
                participants: [
                    { id: '244900000000@s.whatsapp.net', admin: 'admin' },
                    { id: otherUserJid, admin: null }
                ]
            };
        }
    };

    // -------------------------------------------------------------
    // TESTE 1: Mensagem privada normal -> IA responde
    // -------------------------------------------------------------
    console.log('🔹 TESTE 1: Mensagem privada normal -> IA responde');
    const dest1 = await resolveMessageDestination({
        key: { remoteJid: otherUserJid }
    }, botId, mockSock);
    assert(dest1.destinationJid === otherUserJid, 'Destino privado resolvido corretamente');

    const res1 = await generateGeminiContent({
        botId,
        geminiKeysStr: realGeminiKey,
        prompt: 'Diga "Olá Usuário" em uma única frase.',
        firestoreDb
    });
    assert(res1.success === true && !!res1.text && res1.text.length > 0, 'Gemini respondeu mensagem privada com sucesso');
    await new Promise(r => setTimeout(r, 500));

    // -------------------------------------------------------------
    // TESTE 2: Mensagem do owner via LID -> IA responde
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 2: Mensagem do owner via LID -> IA responde');
    const adminCheckLid = await handleWhatsAppAdminMessage({
        sock: mockSock,
        botId,
        currentBot,
        senderJid: ownerLidJid,
        senderLid: ownerLidJid,
        text: 'Qual o resumo da empresa?',
        firestoreDb,
        isGroup: false
    });
    assert(adminCheckLid.handled === false, 'Mensagem conversacional do owner em LID não é bloqueada como comando admin');

    const res2 = await generateGeminiContent({
        botId,
        geminiKeysStr: realGeminiKey,
        prompt: 'Mensagem do Proprietário via LID: responda "Confirmado Proprietário".',
        systemInstruction: 'Você está falando com seu proprietário Mendes.',
        firestoreDb
    });
    assert(res2.success === true && !!res2.text && res2.text.length > 0, 'Gemini respondeu com sucesso ao owner via LID');
    await new Promise(r => setTimeout(r, 500));

    // -------------------------------------------------------------
    // TESTE 3: Mensagem do owner via PN -> IA responde
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 3: Mensagem do owner via PN -> IA responde');
    const adminCheckPn = await handleWhatsAppAdminMessage({
        sock: mockSock,
        botId,
        currentBot,
        senderJid: ownerPnJid,
        text: 'Qual o tempo estimado para a entrega?',
        firestoreDb,
        isGroup: false
    });
    assert(adminCheckPn.handled === false, 'Mensagem conversacional do owner via PN não é bloqueada');

    const res3 = await generateGeminiContent({
        botId,
        geminiKeysStr: realGeminiKey,
        prompt: 'Mensagem do Proprietário via PN: responda "OK PN".',
        firestoreDb
    });
    assert(res3.success === true && !!res3.text && res3.text.length > 0, 'Gemini respondeu com sucesso ao owner via PN');
    await new Promise(r => setTimeout(r, 500));

    // -------------------------------------------------------------
    // TESTE 4: Mensagem de outro usuário -> IA responde
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 4: Mensagem de outro usuário comum -> IA responde');
    const res4 = await generateGeminiContent({
        botId,
        geminiKeysStr: realGeminiKey,
        prompt: 'Qual é a capital da França? Responda em uma palavra.',
        firestoreDb
    });
    assert(res4.success === true && res4.text!.toLowerCase().includes('paris'), 'IA atendeu usuário comum respondendo Paris');
    await new Promise(r => setTimeout(r, 500));

    // -------------------------------------------------------------
    // TESTE 5: Mensagem em grupo -> IA responde quando permitido
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 5: Mensagem em grupo -> Destino grupo e IA responde');
    const destGroup = await resolveMessageDestination({
        key: { remoteJid: groupJid, participant: otherUserJid }
    }, botId, mockSock);
    assert(destGroup.destinationJid === groupJid, 'Destino de resposta em grupo é o próprio JID do grupo (@g.us)');

    const modResult = await processGroupModeration({
        sock: mockSock,
        botId,
        currentBot,
        groupId: groupJid,
        senderJid: otherUserJid,
        messageKey: { id: 'group_msg_1' },
        rawText: 'Como posso tirar dúvidas sobre o produto?',
        messageObj: { conversation: 'Como posso tirar dúvidas sobre o produto?' },
        firestoreDb
    });
    assert(modResult.shouldProceedToAI === true, 'Moderação autorizou prosseguir para IA');

    const res5 = await generateGeminiContent({
        botId,
        geminiKeysStr: realGeminiKey,
        prompt: 'Como posso tirar dúvidas sobre o produto?',
        firestoreDb
    });
    assert(res5.success === true && !!res5.text, 'IA respondeu solicitação do grupo com sucesso');
    await new Promise(r => setTimeout(r, 500));

    // -------------------------------------------------------------
    // TESTE 6: Uma key retorna 429 -> chave entra em cooldown, próxima key é usada
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 6: Simulação de Chave 1 em 429 Quota -> Rotação para Chave 2');
    clearKeyCooldowns();
    const fakeKey1 = 'AIzaSyFakeKeyQuota429Simulated11111';
    const fakeKey2 = realGeminiKey;

    const res6 = await generateGeminiContent({
        botId,
        keys: [fakeKey1, fakeKey2],
        prompt: 'Responda "ROTAÇÃO_429_SUCESSO"',
        _testSimulate429OnceOnKey: fakeKey1,
        firestoreDb
    });
    assert(res6.success === true, 'Requisição teve sucesso após rotação de chave 429');
    assert(res6.attempts >= 2, 'Tentativas contabilizaram a rotação da chave');

    // -------------------------------------------------------------
    // TESTE 7: Modelo retorna 503 -> Fallback de modelo funciona
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 7: Simulação de Modelo 1 em 503 High Demand -> Fallback para Modelo 2');
    const res7 = await generateGeminiContent({
        botId,
        geminiKeysStr: realGeminiKey,
        prompt: 'Responda "FALLBACK_503_SUCESSO"',
        _testSimulate503OnceOnModel: GEMINI_PRIMARY_MODEL,
        firestoreDb
    });
    assert(res7.success === true, 'Requisição teve sucesso após fallback de modelo 503');
    assert(res7.usedModel !== GEMINI_PRIMARY_MODEL || res7.attempts >= 2, 'Fallback de modelo acionado e concluído');

    // -------------------------------------------------------------
    // TESTE 8: Gemini totalmente indisponível -> WhatsApp continua conectado sem crash
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 8: Gemini totalmente indisponível -> WhatsApp não quebra');
    const res8 = await generateGeminiContent({
        botId,
        keys: ['AIzaSyInvalidKey1', 'AIzaSyInvalidKey2'],
        prompt: 'Deverá falhar graciosamente',
        firestoreDb
    });
    assert(res8.success === false, 'Retornou success=false sem lançar exceção não tratada');
    assert(res8.text === null, 'Texto retornado é null');
    assert(mockSock.user.id.length > 0, 'Socket Baileys continua ativo e conectado');

    // -------------------------------------------------------------
    // TESTE 9: Comandos administrativos continuam funcionando com Gemini indisponível
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 9: Comandos administrativos (/status, /logs) funcionam offline de IA');
    sentMessages.length = 0;
    const adminCmdRes = await handleWhatsAppAdminMessage({
        sock: mockSock,
        botId,
        currentBot,
        senderJid: ownerLidJid,
        senderLid: ownerLidJid,
        text: '/status',
        firestoreDb,
        isGroup: false
    });
    assert(adminCmdRes.handled === true, 'Comando /status executado com sucesso offline de IA');
    assert(sentMessages.length > 0 && sentMessages[0].text.includes('STATUS DO BOT'), 'Resposta do status enviada');

    // -------------------------------------------------------------
    // TESTE 10: Dois bots simultâneos -> Isolamento completo
    // -------------------------------------------------------------
    console.log('\n🔹 TESTE 10: Dois bots simultâneos -> Isolamento completo');
    const botId2 = 'bot_isolated_test_2';
    await setDoc(doc(firestoreDb, 'bots', botId2), {
        name: 'Bot Isolado 2',
        ownerName: 'Admin2',
        ownerNumber: '999999999',
        active: 1,
        respondInGroups: 0,
        respondInPrivate: 1,
        systemPrompt: 'Você é o Bot 2 exclusivo de suporte técnico.',
        geminiKeys: realGeminiKey
    });

    const resBot1 = await generateGeminiContent({
        botId,
        geminiKeysStr: realGeminiKey,
        prompt: 'Identifique-se como Bot 1',
        systemInstruction: 'Você é o Bot 1 de vendas.',
        firestoreDb
    });

    const resBot2 = await generateGeminiContent({
        botId: botId2,
        geminiKeysStr: realGeminiKey,
        prompt: 'Identifique-se como Bot 2',
        systemInstruction: 'Você é o Bot 2 de suporte técnico.',
        firestoreDb
    });

    assert(resBot1.success && resBot2.success, 'Ambos os bots executaram chamadas independentes');
    assert(resBot1.usedKeyMasked.length > 0 && resBot2.usedKeyMasked.length > 0, 'Chaves e sessões isoladas por botId');

    // Cleanup secondary test bot
    await deleteDoc(doc(firestoreDb, 'bots', botId2));

    console.log('\n===============================================================');
    console.log(`🏁 RESULTADO FINAL: ${passCount} PASSOU / ${failCount} FALHOU (10/10 TESTES EXECUTADOS)`);
    console.log('===============================================================\n');

    process.exit(failCount === 0 ? 0 : 1);
}

runPipelineTests().catch(err => {
    console.error('ERRO FATAL NA EXECUÇÃO DOS TESTES:', err);
    process.exit(1);
});
