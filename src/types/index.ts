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
  | 'knowledge'
  | 'memory'
  | 'groups'
  | 'group-control'
  | 'intelligence'
  | 'stats'
  | 'logs';

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
