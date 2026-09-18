import cron from 'node-cron';
import { Firestore, doc, getDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { generateGeminiContent } from './geminiService';
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
  const prompt = language === 'en'
    ? `Write an inspiring, powerful, and concise daily motivational thought for a professional WhatsApp group. Focus topic: "${topic || 'Productivity, Success and Gratitude'}". Max 2-3 sentences. Do not use hashtags.`
    : `Escreva uma mensagem motivacional e inspiradora para o dia, direcionada a um grupo de WhatsApp. Tópico/Foco: "${topic || 'Foco, Produtividade, Superação e Sucesso'}". Máximo 2 a 3 frases com impacto e sabedoria. Não use hashtags.`;

  try {
    const result = await generateGeminiContent({
      botId: 'group_scheduler',
      geminiKeysStr,
      prompt
    });

    if (result.success && result.text && result.text.trim().length > 10) {
      return result.text.trim();
    }
  } catch (err) {
    console.warn('[GroupScheduler] Erro ao gerar mensagem motivacional com Gemini, usando fallback:', err);
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

  // Check days of week if specified (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  if (!isTest && Array.isArray(group.dailyMotivationDays) && group.dailyMotivationDays.length > 0) {
    try {
      const todayDayOfWeek = new Date().getDay(); // 0..6
      // Normalize day if 7 was used for Sunday
      const normalizedDays = group.dailyMotivationDays.map(d => d === 7 ? 0 : d);
      if (!normalizedDays.includes(todayDayOfWeek)) {
        console.log(`[GroupScheduler] Hoje (dia ${todayDayOfWeek}) não está na lista de dias de envio para ${groupId}.`);
        return { success: true, messageText: 'Dia da semana não configurado para envio' };
      }
    } catch {}
  }

  // Idempotency: prevent sending twice on the same calendar day (unless it's an explicit manual test)
  if (!isTest && group.lastDailyMotivationDate === todayStr) {
    console.log(`[GroupScheduler] Mensagem diária já enviada hoje (${todayStr}) para o grupo ${groupId}.`);
    return { success: true, messageText: 'Já enviado hoje' };
  }

  // Determine message content based on mode (fixed, ai, rotating)
  let quote = '';
  const mode = group.dailyMotivationMode || 'ai';

  if (mode === 'fixed' && group.dailyMotivationFixedText && group.dailyMotivationFixedText.trim()) {
    quote = group.dailyMotivationFixedText.trim();
  } else if (mode === 'rotating') {
    const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    quote = MOTIVATIONAL_QUOTES[randomIndex];
  } else {
    // Mode AI (or fallback to rotating)
    quote = await generateDailyMotivation(
      group.dailyMotivationTopic,
      geminiKeys,
      group.language || 'pt'
    );
  }

  const title = (group.dailyMotivationTitle || '').trim() || (group.language === 'en' ? 'Daily Motivation' : 'Mensagem do Dia');
  const useEmoji = group.dailyMotivationUseEmoji !== false;

  let formattedMessage = '';
  if (useEmoji) {
    formattedMessage = `☀️ *${title}*\n\n🚀 "${quote}"\n\n✨ Tenham todos um excelente dia de produtividade e conquistas!`;
  } else {
    formattedMessage = `*${title}*\n\n"${quote}"\n\nTenham todos um excelente dia de produtividade e conquistas.`;
  }

  try {
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
      action: isTest ? 'TEST_MOTIVATION_SENT' : 'MOTIVATION_SENT',
      actor: 'SYSTEM_SCHEDULER',
      details: `Mensagem motivacional enviada com sucesso: "${quote.substring(0, 60)}..."`
    });

    console.log(`[GroupScheduler] Mensagem motivacional enviada para o grupo ${group.groupName} (${groupId})`);
    return { success: true, messageText: formattedMessage };
  } catch (err: any) {
    console.error(`[GroupScheduler] Erro ao despachar mensagem motivacional para ${groupId}:`, err);
    await recordGroupLog(firestoreDb, {
      botId,
      groupId,
      groupName: group.groupName,
      action: 'MOTIVATION_FAILED',
      actor: 'SYSTEM_SCHEDULER',
      details: `Falha no envio de mensagem motivacional: ${err.message}`
    });
    throw err;
  }
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
