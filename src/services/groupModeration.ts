import { Firestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { areJidsSameUser } from '@whiskeysockets/baileys';
import { GroupConfig, GroupWarning, GroupLog, ModerationAction } from '../types';
import { normalizePhone, isPhoneMatch, classifyJid, normalizeLid, resolveOwnerIdentity } from '../security';
import { recordAuditLog } from '../audit';
import { 
  resolveOwnWhatsAppIdentity, 
  isSelfIdentity, 
  findBotParticipant, 
  checkIsMentionedOrReply,
  OwnWhatsAppIdentity
} from './whatsappIdentity';

// In-memory spam tracker: key = `${botId}:${groupId}:${participantJid}` -> array of message timestamps (ms)
const spamTracker = new Map<string, number[]>();

// In-memory group metadata cache to avoid hammering Baileys for every message
interface GroupMetaCache {
  admins: Set<string>;
  botIsAdmin: boolean;
  subject: string;
  desc?: string;
  size: number;
  cachedAt: number;
}
const groupMetaCache = new Map<string, GroupMetaCache>();
const CACHE_TTL_MS = 60000; // 1 minute

// In-memory rate limiter for bot AI responses in groups
const groupAiCooldowns = new Map<string, number>();

export const DEFAULT_GROUP_CONFIG: Omit<GroupConfig, 'botId' | 'groupId' | 'groupName'> = {
  antiLinkEnabled: true,
  antiLinkAction: 'delete_and_warn',
  allowedLinks: ['google.com', 'techstar.ao', 'github.com'],
  antiBadWordsEnabled: true,
  badWords: ['spam', 'fraude', 'golpe', 'ofensas', 'porno'],
  badWordsAction: 'delete_and_warn',
  antiSpamEnabled: true,
  antiSpamMaxMessages: 5,
  antiSpamTimeWindowSeconds: 10,
  antiSpamAction: 'warn',
  adminImmunity: true,
  maxWarnings: 3,
  autoKickOnMaxWarnings: true,
  respondOnlyOnMentionOrReply: false,
  responseCooldownSeconds: 5,
  dailyMotivationEnabled: false,
  dailyMotivationTime: '08:00',
  dailyMotivationTimezone: 'Africa/Luanda',
  dailyMotivationTopic: 'Foco, Produtividade e Sucesso',
  welcomeEnabled: true,
  welcomeMessage: 'Olá @user! Seja muito bem-vindo(a) ao grupo! Leia as regras e participe com respeito.',
  exitEnabled: false,
  exitMessage: '@user saiu do grupo.',
  rulesText: '1. Respeite todos os membros.\n2. Não envie links sem autorização.\n3. Proibido spam, correntes ou conteúdo impróprio.',
  language: 'pt'
};

/**
 * Normalizes text to lower-case and removes diacritics for reliable keyword matching.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Extracts links/URLs from message text.
 */
export function extractLinks(text: string): string[] {
  const urlRegex = /(?:https?:\/\/|www\.)[^\s]+|chat\.whatsapp\.com\/[a-zA-Z0-9]+|wa\.me\/[0-9]+|t\.me\/[a-zA-Z0-9_]+/gi;
  const matches = text.match(urlRegex) || [];
  return matches;
}

/**
 * Checks if a detected URL is allowed by the whitelist.
 */
export function isUrlAllowed(url: string, whitelist: string[]): boolean {
  if (!whitelist || whitelist.length === 0) return false;
  const lowerUrl = url.toLowerCase();
  return whitelist.some(allowed => {
    const cleanAllowed = allowed.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (!cleanAllowed) return false;
    return lowerUrl.includes(cleanAllowed);
  });
}

/**
 * Checks if text contains any forbidden words.
 */
export function findForbiddenWords(text: string, badWords: string[]): string[] {
  if (!badWords || badWords.length === 0) return [];
  const normalizedMessage = normalizeText(text);
  
  const found: string[] = [];
  for (const word of badWords) {
    const normWord = normalizeText(word.trim());
    if (!normWord) continue;
    
    // Check whole word boundary or substring depending on length
    const escaped = normWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s|[^a-zA-Z0-9])${escaped}($|\\s|[^a-zA-Z0-9])`, 'i');
    if (regex.test(normalizedMessage)) {
      found.push(word);
    }
  }
  return found;
}

/**
 * Helper to check if a group participant is the bot itself and has admin/superadmin role.
 * Resolves identity robustly using Baileys mechanisms without naive string comparisons.
 */
export function isBotParticipantAdmin(sockUserOrIdentity: any, participant: any): boolean {
  if (!participant) return false;
  const isAdminRole = participant.admin === 'admin' 
    || participant.admin === 'superadmin' 
    || participant.isAdmin === true 
    || participant.isSuperAdmin === true;
  if (!isAdminRole) return false;

  if (sockUserOrIdentity?.ownPhone || sockUserOrIdentity?.ownJid || sockUserOrIdentity?.ownLid) {
    return isSelfIdentity(participant.id || participant.jid, sockUserOrIdentity)
      || isSelfIdentity(participant.phoneNumber || participant.pn, sockUserOrIdentity)
      || (participant.lid && sockUserOrIdentity.ownLid && areJidsSameUser(participant.lid, sockUserOrIdentity.ownLid));
  }

  const pJid = participant.id || participant.jid || '';
  const pLid = participant.lid || '';
  
  const botPhone = normalizePhone(sockUserOrIdentity?.id || sockUserOrIdentity?.jid || sockUserOrIdentity?.botPhone);
  const botLid = sockUserOrIdentity?.lid ? normalizeLid(sockUserOrIdentity.lid) : '';

  const pPhone = normalizePhone(pJid);
  const pLidNorm = pLid ? normalizeLid(pLid) : '';

  if (botPhone && pPhone && (botPhone === pPhone || isPhoneMatch(botPhone, pPhone))) {
    return true;
  }
  if (botLid && pLidNorm && (botLid === pLidNorm || botLid.split('@')[0] === pLidNorm.split('@')[0])) {
    return true;
  }
  if (botPhone && pJid.includes(botPhone)) {
    return true;
  }
  if (participant.phoneNumber && normalizePhone(participant.phoneNumber) === botPhone) {
    return true;
  }
  if (participant.pn && normalizePhone(participant.pn) === botPhone) {
    return true;
  }

  return false;
}

/**
 * Invalidate in-memory group metadata cache.
 */
export function clearGroupMetaCache(groupId?: string) {
  if (groupId) {
    groupMetaCache.delete(groupId);
  } else {
    groupMetaCache.clear();
  }
}

/**
 * Retrieves group metadata from Baileys with caching to minimize round-trips.
 * Accurately determines if the bot is admin using unified identity resolution.
 */
export async function getGroupMeta(
  sock: any, 
  groupId: string, 
  forceRefresh = false,
  currentBot?: any,
  botId?: string
): Promise<GroupMetaCache | null> {
  const now = Date.now();
  const cached = groupMetaCache.get(groupId);
  if (!forceRefresh && cached && (now - cached.cachedAt < CACHE_TTL_MS)) {
    return cached;
  }

  try {
    const meta = await sock.groupMetadata(groupId);
    if (!meta) return null;

    const identity = await resolveOwnWhatsAppIdentity(sock, currentBot, botId);
    const admins = new Set<string>();
    const botResult = findBotParticipant(meta.participants, identity, meta, sock);

    for (const participant of meta.participants || []) {
      const pJid = participant.id || participant.jid;
      if (participant.admin === 'admin' || participant.admin === 'superadmin' || participant.isAdmin || participant.isSuperAdmin) {
        if (pJid) {
          admins.add(pJid);
          admins.add(normalizePhone(pJid));
        }
        if (participant.phoneNumber) admins.add(normalizePhone(participant.phoneNumber));
        if (participant.pn) admins.add(normalizePhone(participant.pn));
        if (participant.lid) admins.add(participant.lid);
      }
    }

    if (meta.owner) {
      admins.add(meta.owner);
      admins.add(normalizePhone(meta.owner));
    }
    if (meta.ownerPn) {
      admins.add(meta.ownerPn);
      admins.add(normalizePhone(meta.ownerPn));
    }

    const groupData: GroupMetaCache = {
      admins,
      botIsAdmin: botResult.isBotAdmin,
      subject: meta.subject || 'Grupo WhatsApp',
      desc: meta.desc?.toString() || '',
      size: (meta.participants || []).length,
      cachedAt: now
    };

    groupMetaCache.set(groupId, groupData);
    return groupData;
  } catch (err) {
    console.warn(`[GroupMod] Erro ao buscar metadados do grupo ${groupId}:`, err);
    return cached || null;
  }
}

/**
 * Fetch or initialize group configuration in Firestore.
 */
export async function getGroupConfig(
  firestoreDb: Firestore,
  botId: string,
  groupId: string,
  groupSubject?: string
): Promise<GroupConfig> {
  const groupRef = doc(firestoreDb, 'bots', botId, 'groups', groupId);
  const snap = await getDoc(groupRef);

  if (snap.exists()) {
    const data = snap.data() as GroupConfig;
    return {
      ...DEFAULT_GROUP_CONFIG,
      ...data,
      botId,
      groupId,
      groupName: data.groupName || groupSubject || 'Grupo WhatsApp'
    };
  }

  // Initialize with defaults
  const newConfig: GroupConfig = {
    ...DEFAULT_GROUP_CONFIG,
    botId,
    groupId,
    groupName: groupSubject || 'Grupo WhatsApp',
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(groupRef, newConfig);
  } catch (err) {
    console.error(`[GroupMod] Erro ao criar config padrão do grupo ${groupId}:`, err);
  }

  return newConfig;
}

/**
 * Records a group-specific audit log in Firestore.
 */
export async function recordGroupLog(
  firestoreDb: Firestore,
  log: Omit<GroupLog, 'timestamp'>
) {
  try {
    const logsRef = collection(firestoreDb, 'bots', log.botId, 'groups', log.groupId, 'logs');
    await addDoc(logsRef, {
      ...log,
      timestamp: serverTimestamp()
    });

    // Also register in general bot audit logs for centralized visibility
    await recordAuditLog(firestoreDb, {
      botId: log.botId,
      role: 'ADMIN',
      action: `GROUP_${log.action}`,
      result: 'SUCCESS',
      details: `[${log.groupId}] ${log.details || log.reason || ''}`
    });
  } catch (err) {
    console.error('[GroupMod] Erro ao gravar group log:', err);
  }
}

/**
 * Manages member warnings. Increments count and applies kick if threshold is met.
 */
export async function addMemberWarning(
  firestoreDb: Firestore,
  sock: any,
  config: GroupConfig,
  participantJid: string,
  reason: string
): Promise<{ warningCount: number; kicked: boolean }> {
  const normPhone = normalizePhone(participantJid);
  const warningRef = doc(firestoreDb, 'bots', config.botId, 'groups', config.groupId, 'warnings', normPhone);
  const snap = await getDoc(warningRef);

  let currentCount = 1;
  let reasons = [reason];

  if (snap.exists()) {
    const data = snap.data() as GroupWarning;
    currentCount = (data.count || 0) + 1;
    reasons = Array.isArray(data.reasons) ? [...data.reasons, reason] : [reason];
    await updateDoc(warningRef, {
      count: currentCount,
      reasons: reasons.slice(-10), // keep last 10 reasons
      lastWarningAt: serverTimestamp()
    });
  } else {
    await setDoc(warningRef, {
      botId: config.botId,
      groupId: config.groupId,
      participantJid,
      participantPhone: normPhone,
      count: currentCount,
      reasons,
      lastWarningAt: serverTimestamp()
    });
  }

  let kicked = false;
  const userMention = `@${normPhone}`;

  // Check if warnings exceed threshold
  if (config.autoKickOnMaxWarnings && currentCount >= config.maxWarnings) {
    try {
      const meta = await getGroupMeta(sock, config.groupId);
      if (meta?.botIsAdmin) {
        await sock.groupParticipantsUpdate(config.groupId, [participantJid], 'remove');
        kicked = true;

        await sock.sendMessage(config.groupId, {
          text: `🚨 *Remoção Automática*\nO membro ${userMention} atingiu o limite de advertências (*${currentCount}/${config.maxWarnings}*) e foi removido do grupo.\n\nMotivo final: _${reason}_`,
          mentions: [participantJid]
        });

        await recordGroupLog(firestoreDb, {
          botId: config.botId,
          groupId: config.groupId,
          groupName: config.groupName,
          action: 'MEMBER_KICKED_WARNINGS_EXCEEDED',
          actor: 'TECHSTAR_BOT',
          targetUser: normPhone,
          reason,
          details: `Removido após acumular ${currentCount} advertências (Limite: ${config.maxWarnings}).`
        });
      } else {
        await sock.sendMessage(config.groupId, {
          text: `⚠️ *Limite de Advertências Atingido*\nO membro ${userMention} acumulou *${currentCount}/${config.maxWarnings}* advertências, mas o bot não possui privilégios de administrador para aplicar a remoção.`,
          mentions: [participantJid]
        });
      }
    } catch (e: any) {
      console.error(`[GroupMod] Erro ao remover membro ${participantJid}:`, e);
    }
  } else {
    // Send standard warning notice
    const textMsg = config.language === 'en'
      ? `⚠️ *Warning for ${userMention}* (${currentCount}/${config.maxWarnings})\nReason: ${reason}\nPlease follow the group rules.`
      : `⚠️ *Advertência para ${userMention}* (${currentCount}/${config.maxWarnings})\nMotivo: ${reason}\nPor favor, respeite as regras do grupo para evitar remoção.`;

    await sock.sendMessage(config.groupId, {
      text: textMsg,
      mentions: [participantJid]
    });

    await recordGroupLog(firestoreDb, {
      botId: config.botId,
      groupId: config.groupId,
      groupName: config.groupName,
      action: 'MEMBER_WARNED',
      actor: 'TECHSTAR_BOT',
      targetUser: normPhone,
      reason,
      details: `Advertência ${currentCount}/${config.maxWarnings} aplicada.`
    });
  }

  return { warningCount: currentCount, kicked };
}

/**
 * Checks Anti-Spam (rate-limiting messages from a user).
 */
export function checkSpam(
  botId: string,
  groupId: string,
  participantJid: string,
  maxMessages: number,
  timeWindowSeconds: number
): boolean {
  const key = `${botId}:${groupId}:${normalizePhone(participantJid)}`;
  const now = Date.now();
  const windowMs = timeWindowSeconds * 1000;

  const timestamps = spamTracker.get(key) || [];
  const validTimestamps = timestamps.filter(ts => (now - ts) <= windowMs);
  validTimestamps.push(now);
  spamTracker.set(key, validTimestamps);

  return validTimestamps.length > maxMessages;
}

export interface ModerationResult {
  blocked: boolean;
  reason?: string;
  actionTaken?: string;
  shouldProceedToAI: boolean;
}

/**
 * Core Deterministic Moderation Pipeline.
 * Evaluates messages before any AI model is contacted.
 */
export async function processGroupModeration(opts: {
  sock: any;
  botId: string;
  currentBot: any;
  groupId: string;
  senderJid: string;
  messageKey: any;
  rawText: string;
  messageObj: any;
  firestoreDb: Firestore;
}): Promise<ModerationResult> {
  const { sock, botId, currentBot, groupId, senderJid, messageKey, rawText, messageObj, firestoreDb } = opts;

  // 1. Fetch group config
  const groupConfig = await getGroupConfig(firestoreDb, botId, groupId);

  // 2. Fetch group metadata & check immunity
  const meta = await getGroupMeta(sock, groupId, false, currentBot, botId);
  const identity = await resolveOwnWhatsAppIdentity(sock, currentBot, botId, firestoreDb);
  const ownerIdentity = resolveOwnerIdentity(currentBot);
  const senderType = classifyJid(senderJid);
  const normSender = senderType === 'PRIVATE_PN' ? normalizePhone(senderJid) : '';

  // Check if sender is the registered owner (via LID, Phone, or JID)
  let isOwner = false;
  if (senderType === 'LID') {
    if (ownerIdentity.lid && (senderJid === ownerIdentity.lid || senderJid.split('@')[0] === ownerIdentity.lid.split('@')[0])) {
      isOwner = true;
    } else if (senderJid === '29596971991096@lid') {
      isOwner = true;
    }
  } else if (senderType === 'PRIVATE_PN') {
    if (ownerIdentity.phone && isPhoneMatch(normSender, ownerIdentity.phone)) {
      isOwner = true;
    } else if (ownerIdentity.jid && senderJid === ownerIdentity.jid) {
      isOwner = true;
    }
  }

  // Immune if sender is the bot itself, the registered owner, or a group admin (if adminImmunity is on)
  const isBot = isSelfIdentity(senderJid, identity, sock);
  const isGroupAdmin = meta?.admins.has(senderJid) || (normSender && meta?.admins.has(normSender)) || false;
  const isImmune = isBot || isOwner || (groupConfig.adminImmunity && isGroupAdmin);

  // Check mention and reply status with unified identity
  const { isMentioned, isReplyToBot } = checkIsMentionedOrReply({
    messageObj,
    rawText,
    identity,
    sock
  });

  // Verify group response policy
  const respondInGroups = currentBot.respondInGroups !== false && currentBot.respondInGroups !== 0;
  const respondOnlyOnMention = groupConfig.respondOnlyOnMentionOrReply === true;
  let canProceedToAI = respondInGroups;

  if (respondOnlyOnMention && !isMentioned && !isReplyToBot) {
    canProceedToAI = false;
  }

  // Structured logging for response policy
  console.log(`[GROUP_RESPONSE_POLICY]`, {
    botId,
    groupId,
    respondInGroups,
    respondOnlyOnMentionOrReply: respondOnlyOnMention,
    isMentioned,
    isReplyToBot,
    canProceed: canProceedToAI
  });

  if (isImmune) {
    if (!respondInGroups) {
      console.log(`[GROUP_MESSAGE_SKIPPED]`, { botId, groupId, reason: 'GROUP_RESPONSES_DISABLED' });
      return { blocked: false, shouldProceedToAI: false };
    }
    if (respondOnlyOnMention && !isMentioned && !isReplyToBot) {
      console.log(`[GROUP_MESSAGE_SKIPPED]`, { botId, groupId, reason: 'BOT_NOT_MENTIONED' });
      return { blocked: false, shouldProceedToAI: false };
    }
    // Check cooldown
    const shouldRespond = evaluateAiTrigger({
      sock,
      rawText,
      messageObj,
      config: groupConfig,
      groupId,
      identity,
      botId
    });
    return { blocked: false, shouldProceedToAI: shouldRespond };
  }

  // 3. ANTI-LINK CHECK
  if (groupConfig.antiLinkEnabled && rawText) {
    const links = extractLinks(rawText);
    const unauthorizedLinks = links.filter(l => !isUrlAllowed(l, groupConfig.allowedLinks));

    if (unauthorizedLinks.length > 0) {
      console.log(`[GroupMod] Link não autorizado detectado em ${groupId} por ${normSender}:`, unauthorizedLinks);
      
      // Delete message if bot is admin
      if (meta?.botIsAdmin) {
        try {
          await sock.sendMessage(groupId, { delete: messageKey });
        } catch (delErr) {
          console.warn('[GroupMod] Falha ao deletar mensagem com link:', delErr);
        }
      }

      const action = groupConfig.antiLinkAction;
      if (action === 'warn' || action === 'delete_and_warn') {
        await addMemberWarning(
          firestoreDb,
          sock,
          groupConfig,
          senderJid,
          `Envio de link não autorizado: ${unauthorizedLinks[0]}`
        );
      } else if (action === 'remove' && meta?.botIsAdmin) {
        await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');
        await sock.sendMessage(groupId, {
          text: `🚨 *Remoção por Link*\nO membro @${normSender} foi removido por compartilhar links não autorizados.`,
          mentions: [senderJid]
        });
        await recordGroupLog(firestoreDb, {
          botId,
          groupId,
          groupName: groupConfig.groupName,
          action: 'MEMBER_REMOVED_LINK',
          actor: 'TECHSTAR_BOT',
          targetUser: normSender,
          reason: `Link proibido: ${unauthorizedLinks[0]}`
        });
      }

      console.log(`[GROUP_MESSAGE_SKIPPED]`, { botId, groupId, reason: 'BLOCKED_MODERATION_LINK' });
      return { blocked: true, reason: 'LINK_PROIBIDO', actionTaken: action, shouldProceedToAI: false };
    }
  }

  // 4. ANTI-BAD WORDS CHECK
  if (groupConfig.antiBadWordsEnabled && rawText) {
    const forbidden = findForbiddenWords(rawText, groupConfig.badWords);
    if (forbidden.length > 0) {
      console.log(`[GroupMod] Palavra proibida detectada em ${groupId} por ${normSender}:`, forbidden);

      if (meta?.botIsAdmin) {
        try {
          await sock.sendMessage(groupId, { delete: messageKey });
        } catch (delErr) {
          console.warn('[GroupMod] Falha ao deletar mensagem com palavra proibida:', delErr);
        }
      }

      const action = groupConfig.badWordsAction;
      if (action === 'warn' || action === 'delete_and_warn') {
        await addMemberWarning(
          firestoreDb,
          sock,
          groupConfig,
          senderJid,
          `Linguagem inadequada / palavra proibida: "${forbidden[0]}"`
        );
      } else if (action === 'remove' && meta?.botIsAdmin) {
        await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');
        await sock.sendMessage(groupId, {
          text: `🚨 *Remoção*\nO membro @${normSender} foi removido por uso de vocabulário impróprio.`,
          mentions: [senderJid]
        });
        await recordGroupLog(firestoreDb, {
          botId,
          groupId,
          groupName: groupConfig.groupName,
          action: 'MEMBER_REMOVED_BAD_WORD',
          actor: 'TECHSTAR_BOT',
          targetUser: normSender,
          reason: `Palavra proibida: ${forbidden[0]}`
        });
      }

      console.log(`[GROUP_MESSAGE_SKIPPED]`, { botId, groupId, reason: 'BLOCKED_MODERATION_BAD_WORD' });
      return { blocked: true, reason: 'PALAVRA_PROIBIDA', actionTaken: action, shouldProceedToAI: false };
    }
  }

  // 5. ANTI-SPAM / ANTI-FLOOD CHECK
  if (groupConfig.antiSpamEnabled) {
    const isSpamming = checkSpam(
      botId,
      groupId,
      senderJid,
      groupConfig.antiSpamMaxMessages,
      groupConfig.antiSpamTimeWindowSeconds
    );

    if (isSpamming) {
      console.log(`[GroupMod] Spam/Flood detectado em ${groupId} por ${normSender}`);

      if (meta?.botIsAdmin) {
        try {
          await sock.sendMessage(groupId, { delete: messageKey });
        } catch {}
      }

      const action = groupConfig.antiSpamAction;
      if (action === 'warn') {
        await addMemberWarning(
          firestoreDb,
          sock,
          groupConfig,
          senderJid,
          `Envio excessivo de mensagens (Anti-Flood: > ${groupConfig.antiSpamMaxMessages} msgs em ${groupConfig.antiSpamTimeWindowSeconds}s)`
        );
      } else if (action === 'remove' && meta?.botIsAdmin) {
        await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');
        await sock.sendMessage(groupId, {
          text: `🚨 *Anti-Spam*\nO membro @${normSender} foi removido por excesso de mensagens repetidas/flood.`,
          mentions: [senderJid]
        });
      }

      console.log(`[GROUP_MESSAGE_SKIPPED]`, { botId, groupId, reason: 'BLOCKED_MODERATION_SPAM' });
      return { blocked: true, reason: 'SPAM_FLOOD', actionTaken: action, shouldProceedToAI: false };
    }
  }

  // 6. Check response policy and triggers
  if (!respondInGroups) {
    console.log(`[GROUP_MESSAGE_SKIPPED]`, { botId, groupId, reason: 'GROUP_RESPONSES_DISABLED' });
    return { blocked: false, shouldProceedToAI: false };
  }

  if (respondOnlyOnMention && !isMentioned && !isReplyToBot) {
    console.log(`[GROUP_MESSAGE_SKIPPED]`, { botId, groupId, reason: 'BOT_NOT_MENTIONED' });
    return { blocked: false, shouldProceedToAI: false };
  }

  // 7. Check if bot should respond via AI
  const shouldRespond = evaluateAiTrigger({
    sock,
    rawText,
    messageObj,
    config: groupConfig,
    groupId,
    identity,
    botId
  });

  return { blocked: false, shouldProceedToAI: shouldRespond };
}

/**
 * Checks whether this group message should trigger an AI response from the bot.
 * Enforces cooldown limits.
 */
function evaluateAiTrigger(opts: {
  sock: any;
  rawText: string;
  messageObj: any;
  config: GroupConfig;
  groupId: string;
  identity?: OwnWhatsAppIdentity;
  botId?: string;
}): boolean {
  const { config, groupId, botId } = opts;

  // Check rate-limit cooldown
  const now = Date.now();
  const cooldownMs = (config.responseCooldownSeconds || 3) * 1000;
  const lastResponse = groupAiCooldowns.get(groupId) || 0;

  if (now - lastResponse < cooldownMs) {
    console.log(`[GROUP_MESSAGE_SKIPPED]`, {
      botId: botId || 'unknown',
      groupId,
      reason: 'COOLDOWN',
      remainingSeconds: ((cooldownMs - (now - lastResponse))/1000).toFixed(1)
    });
    return false;
  }

  groupAiCooldowns.set(groupId, now);
  return true;
}
