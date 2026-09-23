export type UserRole = 'ADMIN' | 'OWNER' | 'USER';

export interface Bot {
  id: string;
  name: string;
  status: 'Conectado' | 'Desconectado' | 'Conectando...' | 'Desativado' | string;
  active: number;
  accessToken?: string;
  systemPrompt?: string;
  welcomeMsg?: string;
  exitMsg?: string;
  knowledgeBase?: string;
  geminiKeys?: string;
  hasGeminiKeys?: boolean;
  geminiKeysConfigured?: boolean;
  groupWelcomeEnabled?: number;
  groupWelcomeMsg?: string;
  groupExitEnabled?: number;
  groupExitMsg?: string;
  respondInGroups?: number;
  respondInPrivate?: number;
  privateWelcomeEnabled?: number;
  privateExitEnabled?: number;
  memoryEnabled?: number;
  analysisEnabled?: number;
  analysisInstructions?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerNumber?: string;
  ownerPermissions?: string[];
  pinHash?: string;
  firstAccessCompleted?: boolean;
  qr?: string | null;
  hasQR?: boolean;
  description?: string;
  avatarUrl?: string;
  ownerLid?: string;
  ownerJid?: string;
  ownerVerificationStatus?: 'VERIFIED' | 'PENDING' | 'UNVERIFIED';
  connectedPhone?: string;
  connectedLid?: string;
  connectedJid?: string;
  lastConnectedAt?: string;
  lastActiveAt?: string;
  lastMessageReceivedAt?: string;
  lastMessageSentAt?: string;
  aiEnabled?: boolean;
  aiModel?: string;
  aiState?: string;
  aiFallbackActive?: boolean;
  naturalConversationEnabled?: boolean;
  respondOnlyOnMentionOrReply?: boolean;
  responseCooldownSeconds?: number;
  antiLinkEnabled?: boolean;
  antiBadWordsEnabled?: boolean;
  badWords?: string[];
  antiSpamEnabled?: boolean;
  antiSpamMaxMessages?: number;
  adminImmunity?: boolean;
  moderationAction?: 'warn' | 'delete' | 'remove' | 'kick' | string;
  dailyMotivationEnabled?: boolean;
  dailyMotivationTitle?: string;
  dailyMotivationUseEmoji?: boolean;
  dailyMotivationMode?: 'ai' | 'fixed' | 'rotating';
  dailyMotivationFixedText?: string;
  dailyMotivationDays?: number[];
  dailyMotivationTime?: string;
  dailyMotivationTimezone?: string;
  dailyMotivationTopic?: string;
  dailyMotivationQuotes?: string[];
  plan?: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
  planLimits?: {
    maxMessagesPerMonth?: number;
    maxGroups?: number;
    maxKnowledgeChars?: number;
    aiEnabled?: boolean;
  };
  createdAt?: any;
}

export interface BotSummaryStat {
  botId: string;
  name: string;
  status: string;
  messagesCount: number;
  contactsCount: number;
}

export interface AdminStats {
  totalBots: number;
  onlineBots: number;
  offlineBots: number;
  totalMessages: number;
  totalUsers: number;
  botStats: BotSummaryStat[];
  recentActivity: AuditLog[];
  systemMetrics?: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    uptimeHours: string;
    nodeVersion: string;
  };
  errorLogsCount?: number;
  aiSuccessRate?: string;
}

export interface BotStats {
  totalMessages: number;
  userMessages: number;
  modelMessages: number;
  totalContacts: number;
  memoryItems: number;
}

export interface MemoryContact {
  jid: string;
  messageCount: number;
  lastMessage: string;
  lastTimestamp: string;
}

export interface AuditLog {
  id?: string;
  botId: string;
  role: string;
  action: string;
  command?: string;
  result: 'SUCCESS' | 'DENIED' | string;
  details?: string;
  senderPhone?: string;
  createdAt?: string | number;
  timestamp?: any;
}

export type ActiveTab = 
  | 'overview'
  | 'whatsapp'
  | 'quick-config'
  | 'private'
  | 'groups'
  | 'moderation'
  | 'memory'
  | 'knowledge'
  | 'automation'
  | 'motivation'
  | 'documents'
  | 'intelligence'
  | 'stats'
  | 'logs'
  | 'settings';

export type ModerationAction = 'delete' | 'warn' | 'remove' | 'delete_and_warn';

export interface GroupConfig {
  botId: string;
  groupId: string; // JID, e.g. 120363xxx@g.us
  groupName: string;
  groupDesc?: string;
  participantCount?: number;
  botIsAdmin?: boolean;
  
  // Anti-Link
  antiLinkEnabled: boolean;
  antiLinkAction: ModerationAction;
  allowedLinks: string[];
  
  // Anti-Bad Words
  antiBadWordsEnabled: boolean;
  badWords: string[];
  badWordsAction: ModerationAction;
  
  // Anti-Spam / Anti-Flood
  antiSpamEnabled: boolean;
  antiSpamMaxMessages: number;
  antiSpamTimeWindowSeconds: number;
  antiSpamAction: 'warn' | 'remove' | 'delete';
  
  // Member & Admin Protection
  adminImmunity: boolean;
  maxWarnings: number;
  autoKickOnMaxWarnings: boolean;
  
  // Interaction & Mentions
  respondOnlyOnMentionOrReply: boolean;
  responseCooldownSeconds: number;
  
  // Daily Scheduled Automation
  dailyMotivationEnabled: boolean;
  dailyMotivationTitle?: string;
  dailyMotivationUseEmoji?: boolean;
  dailyMotivationMode?: 'fixed' | 'ai' | 'rotating';
  dailyMotivationFixedText?: string;
  dailyMotivationDays?: number[]; // [1, 2, 3, 4, 5, 6, 0]
  dailyMotivationTime: string; // "08:00"
  dailyMotivationTimezone: string; // e.g. "Africa/Luanda"
  dailyMotivationTopic?: string;
  lastDailyMotivationDate?: string; // YYYY-MM-DD to avoid duplicates
  
  // Welcome & Exit
  welcomeEnabled: boolean;
  welcomeMessage: string;
  exitEnabled: boolean;
  exitMessage: string;
  
  // Group rules
  rulesText?: string;
  
  language: 'pt' | 'en';
  updatedAt?: any;
}

export interface GroupWarning {
  id?: string;
  botId: string;
  groupId: string;
  participantJid: string;
  participantPhone: string;
  count: number;
  reasons: string[];
  lastWarningAt?: any;
}

export interface GroupLog {
  id?: string;
  botId: string;
  groupId: string;
  groupName?: string;
  action: string;
  actor: string;
  targetUser?: string;
  reason?: string;
  details?: string;
  timestamp?: any;
}
