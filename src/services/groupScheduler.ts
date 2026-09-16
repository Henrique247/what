import cron from 'node-cron';
import { Firestore, doc, getDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';
import { GroupConfig } from '../types';
import { recordGroupLog } from './groupModeration';

// Store active cron tasks in memory: key = `${botId}:${groupId}`
const scheduledTasks = new Map<string, ReturnType<typeof cron.schedule>>();

// High-quality motivational quotes library (Fallback if Gemini is offline/without key)
const MOTIVATIONAL_QUOTES = [
  "O sucesso nasce do querer, da determinação e persistência em se chegar a um objetivo.",
  "Grandes realizações são construídas através de pequenas ações consistentes todos os dias.",
  "A disciplina é a ponte entre seus objetivos e suas conquistas.",
  "Nunca é tarde demais para ser aquilo que você sempre sonhou ser.",
  "Foque nas soluções, não nos problemas. Cada desafio é uma oportunidade de crescimento.",
  "A consistência vence o talento quando o talento não é consistente.",
  "Acredite no poder do trabalho duro, da resiliência e da fé em seu propósito."
];

/**
 * Generates an inspiring daily message using Gemini or fallback library.
 */
export async function generateDailyMotivation(
  topic?: string,
  geminiKeysStr?: string,
  language: 'pt' | 'en' = 'pt'
): Promise<string> {
  if (geminiKeysStr) {
    const keys = geminiKeysStr.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      try {
        const cleanKey = keys[0].replace(/["']/g, '');
        const ai = new GoogleGenAI({ apiKey: cleanKey });
        const prompt = language === 'en'
          ? `Write an inspiring, powerful, and concise daily motivational thought for a professional WhatsApp group. Focus topic: "${topic || 'Productivity, Success and Gratitude'}". Max 2-3 sentences. Do not use hashtags.`
          : `Escreva uma mensagem motivacional e inspiradora para o dia, direcionada a um grupo de WhatsApp. Tópico/Foco: "${topic || 'Foco, Produtividade, Superação e Sucesso'}". Máximo 2 a 3 frases com impacto e sabedoria. Não use hashtags.`;

        const resp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt
        });

        const text = resp.text?.trim();
        if (text && text.length > 10) {
          return text;
        }
      } catch (err) {
        console.warn('[GroupScheduler] Erro ao gerar mensagem motivacional com Gemini, usando fallback:', err);
      }
    }
  }

  // Fallback
  const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  return MOTIVATIONAL_QUOTES[randomIndex];
}

/**
 * Formats current date string in YYYY-MM-DD for a given timezone.
 */
function getTodayDateString(timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'Africa/Luanda',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date()); // Returns YYYY-MM-DD
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Triggers sending the daily motivational message to a group.
 */
export async function sendDailyMotivationToGroup(opts: {
  botId: string;
  groupId: string;
  sock: any;
  firestoreDb: Firestore;
  geminiKeys?: string;
  isTest?: boolean;
}): Promise<{ success: boolean; messageText: string }> {
  const { botId, groupId, sock, firestoreDb, geminiKeys, isTest = false } = opts;

  const groupRef = doc(firestoreDb, 'bots', botId, 'groups', groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) {
    throw new Error('Configuração do grupo não encontrada');
  }

  const group = snap.data() as GroupConfig;
  const tz = group.dailyMotivationTimezone || 'Africa/Luanda';
  const todayStr = getTodayDateString(tz);

  // Idempotency: prevent sending twice on the same calendar day (unless it's an explicit manual test)
  if (!isTest && group.lastDailyMotivationDate === todayStr) {
    console.log(`[GroupScheduler] Mensagem diária já enviada hoje (${todayStr}) para o grupo ${groupId}.`);
    return { success: true, messageText: 'Já enviado hoje' };
  }

  const quote = await generateDailyMotivation(
    group.dailyMotivationTopic,
    geminiKeys,
    group.language || 'pt'
  );

  const formattedMessage = group.language === 'en'
    ? `🌅 *Daily Motivation*\n\n"${quote}"\n\nHave a productive and blessed day everyone! ✨`
    : `🌅 *TECHSTAR | Mensagem do Dia*\n\n"${quote}"\n\nTenham todos um dia produtivo, abençoado e de grandes conquistas! ✨`;

  // Send message to WhatsApp group
  await sock.sendMessage(groupId, { text: formattedMessage });

  // Update last sent date
  if (!isTest) {
    await updateDoc(groupRef, {
      lastDailyMotivationDate: todayStr
    });
  }

  // Record audit log
  await recordGroupLog(firestoreDb, {
    botId,
    groupId,
    groupName: group.groupName,
    action: isTest ? 'TEST_MOTIVATION_SENT' : 'DAILY_MOTIVATION_SENT',
    actor: 'TECHSTAR_SCHEDULER',
    details: `Mensagem enviada com sucesso: "${quote.substring(0, 60)}..."`
  });

  console.log(`[GroupScheduler] Mensagem motivacional enviada para o grupo ${group.groupName} (${groupId})`);
  return { success: true, messageText: formattedMessage };
}

/**
 * Configures or re-schedules a daily motivational job for a specific group.
 */
export function scheduleGroupMotivation(opts: {
  botId: string;
  groupConfig: GroupConfig;
  getActiveSock: (botId: string) => any;
  firestoreDb: Firestore;
  geminiKeys?: string;
}) {
  const { botId, groupConfig, getActiveSock, firestoreDb, geminiKeys } = opts;
  const taskKey = `${botId}:${groupConfig.groupId}`;

  // Cancel any existing schedule for this group
  if (scheduledTasks.has(taskKey)) {
    try {
      scheduledTasks.get(taskKey)?.stop();
    } catch {}
    scheduledTasks.delete(taskKey);
  }

  if (!groupConfig.dailyMotivationEnabled) {
    return;
  }

  const time = groupConfig.dailyMotivationTime || '08:00';
  const [hourStr, minStr] = time.split(':');
  const hour = parseInt(hourStr, 10) || 8;
  const minute = parseInt(minStr, 10) || 0;

  // Cron expression: minute hour * * * (runs every day at that minute & hour)
  const cronExpr = `${minute} ${hour} * * *`;
  const tz = groupConfig.dailyMotivationTimezone || 'Africa/Luanda';

  console.log(`[GroupScheduler] Agendando motivação diária para ${groupConfig.groupName} (${taskKey}) às ${time} [${tz}] (Cron: ${cronExpr})`);

  try {
    const task = cron.schedule(cronExpr, async () => {
      console.log(`[GroupScheduler] Disparando cron diário para ${taskKey} [${tz}]...`);
      const sock = getActiveSock(botId);
      if (!sock) {
        console.warn(`[GroupScheduler] Socket do bot ${botId} desconectado ao executar cron.`);
        return;
      }

      try {
        await sendDailyMotivationToGroup({
          botId,
          groupId: groupConfig.groupId,
          sock,
          firestoreDb,
          geminiKeys
        });
      } catch (err) {
        console.error(`[GroupScheduler] Erro ao enviar motivação programada para ${groupConfig.groupId}:`, err);
      }
    }, {
      timezone: tz
    });

    scheduledTasks.set(taskKey, task);
  } catch (err) {
    console.error(`[GroupScheduler] Erro ao criar cron job para ${taskKey}:`, err);
  }
}

/**
 * Initializes all active group schedulers for a bot when it connects.
 */
export async function initBotGroupSchedulers(opts: {
  botId: string;
  getActiveSock: (botId: string) => any;
  firestoreDb: Firestore;
  geminiKeys?: string;
}) {
  const { botId, getActiveSock, firestoreDb, geminiKeys } = opts;
  try {
    const groupsRef = collection(firestoreDb, 'bots', botId, 'groups');
    const snap = await getDocs(groupsRef);

    snap.docs.forEach(docSnap => {
      const config = docSnap.data() as GroupConfig;
      if (config.dailyMotivationEnabled) {
        scheduleGroupMotivation({
          botId,
          groupConfig: config,
          getActiveSock,
          firestoreDb,
          geminiKeys
        });
      }
    });
    console.log(`[GroupScheduler] Agendamentos de grupos verificados para bot ${botId} (${snap.size} grupos).`);
  } catch (err) {
    console.error(`[GroupScheduler] Erro ao carregar agendamentos do bot ${botId}:`, err);
  }
}

/**
 * Cleans up all scheduled tasks for a bot when it disconnects or is deleted.
 */
export function clearBotSchedulers(botId: string) {
  for (const [key, task] of scheduledTasks.entries()) {
    if (key.startsWith(`${botId}:`)) {
      try {
        task.stop();
      } catch {}
      scheduledTasks.delete(key);
    }
  }
}
