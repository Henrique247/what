import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  ActiveTab, 
  BotStats, 
  MemoryContact, 
  AuditLog 
} from '../types';
import { 
  ArrowLeft, 
  RotateCw, 
  Power, 
  Activity, 
  QrCode, 
  Sliders, 
  Users, 
  Terminal,
  Shield,
  MessageSquare,
  Database,
  BookOpen,
  Cpu,
  SunMedium,
  FileText,
  BarChart3,
  Settings,
  Save,
  Copy,
  Check,
  Trash2,
  Phone,
  Search,
  CheckCircle2,
  Lock,
  Wifi,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../services/api';
import { GroupControlView } from '../components/GroupControlView';
import { ConfigurationTab } from '../components/bot-manage/ConfigurationTab';
import { WhatsAppConnectionTab } from '../components/bot-manage/WhatsAppConnectionTab';
import { BotLogsTab, LogEntry } from '../components/bot-manage/BotLogsTab';
import { GroupRulesTab } from '../components/bot-manage/GroupRulesTab';
import { BotSettingsTab } from '../components/settings/BotSettingsTab';
import { PrivateSettingsCard } from '../components/settings/PrivateSettingsCard';
import { ModerationSettingsCard } from '../components/settings/ModerationSettingsCard';
import { MotivationSettingsCard } from '../components/settings/MotivationSettingsCard';
import { DocumentPdfCard } from '../components/DocumentPdfCard';

interface BotManagePageProps {
  bot: Bot;
  activeTab?: ActiveTab;
  onSelectTab?: (tab: ActiveTab) => void;
  onUpdateBot?: (updatedBot: Bot) => void;
  isAdminMode?: boolean;
  clientToken?: string;
  onBack?: () => void;
  onRestartBot?: (botId: string) => Promise<void>;
  onDisconnectBot?: (botId: string) => Promise<void>;
}

export const BotManagePage: React.FC<BotManagePageProps> = ({
  bot,
  activeTab = 'overview',
  onSelectTab,
  onUpdateBot,
  isAdminMode = true,
  clientToken,
  onBack,
  onRestartBot,
  onDisconnectBot
}) => {
  const toast = useToast();

  // Internal tab state if not controlled externally
  const [internalTab, setInternalTab] = useState<ActiveTab>(activeTab || 'overview');
  const currentTab = onSelectTab ? activeTab : internalTab;
  const handleTabChange = (tab: ActiveTab) => {
    if (onSelectTab) {
      onSelectTab(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Action states
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Bot>>({ ...bot });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // WhatsApp & QR State
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(bot.qr || null);
  const [resettingWA, setResettingWA] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Stats, Memory, Logs, Groups state
  const [stats, setStats] = useState<BotStats | null>(null);
  const [memoryContacts, setMemoryContacts] = useState<MemoryContact[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [groupList, setGroupList] = useState<any[]>([]);
  const [loadingTabData, setLoadingTabData] = useState(false);

  // Clear memory modal
  const [confirmClearMemory, setConfirmClearMemory] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);

  // Search filters
  const [logFilter, setLogFilter] = useState('');
  const [memoryFilter, setMemoryFilter] = useState('');

  // Sync formData when bot prop updates
  useEffect(() => {
    setFormData({ ...bot });
    setQrCodeUrl(bot.qr || null);
    setHasChanges(false);
  }, [bot.id]);

  // Load tab-specific data
  useEffect(() => {
    let isMounted = true;

    const loadDataForTab = async () => {
      setLoadingTabData(true);
      try {
        if (currentTab === 'stats' || currentTab === 'overview') {
          const s = await api.getBotStats(bot.id, clientToken, isAdminMode);
          if (isMounted) setStats(s);
        }
        if (currentTab === 'memory') {
          const mem = await api.getBotMemory(bot.id, clientToken, isAdminMode);
          if (isMounted) setMemoryContacts(mem);
        } else if (currentTab === 'logs') {
          const logs = await api.getBotAuditLogs(bot.id, clientToken, isAdminMode);
          if (isMounted) setAuditLogs(logs);
        } else if (currentTab === 'groups') {
          const grps = await api.getBotGroups(bot.id, clientToken, isAdminMode);
          if (isMounted) {
            setGroupList(grps.map(g => ({
              id: g.groupId,
              jid: g.groupId,
              name: g.groupName,
              membersCount: g.participantCount,
              isBotAdmin: g.botIsAdmin,
              antiLinkEnabled: g.config?.antiLinkEnabled ?? false,
              antiSpamEnabled: g.config?.antiSpamEnabled ?? false,
              welcomeEnabled: g.config?.welcomeEnabled ?? false,
            })));
          }
        } else if (currentTab === 'whatsapp') {
          const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
          if (isMounted) {
            setQrCodeUrl(fresh.qr || null);
            if (onUpdateBot) onUpdateBot(fresh);
          }
        }
      } catch (e: any) {
        console.error('Erro ao carregar dados da aba:', e);
      } finally {
        if (isMounted) setLoadingTabData(false);
      }
    };

    loadDataForTab();
    return () => {
      isMounted = false;
    };
  }, [currentTab, bot.id]);

  // Handle Input Changes
  const handleChange = (key: keyof Bot, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Save Config
  const handleSave = async () => {
    try {
      setSaving(true);
      await api.saveBotConfig(bot.id, formData, clientToken, isAdminMode);
      toast.success('Configurações salvas com sucesso!');
      setHasChanges(false);
      if (onUpdateBot) onUpdateBot({ ...bot, ...formData } as Bot);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  // Restart Handler
  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      if (onRestartBot) {
        await onRestartBot(bot.id);
      } else {
        await api.resetBotSession(bot.id, clientToken, isAdminMode);
        toast.success('Sessão do bot reiniciada com sucesso.');
      }
      const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
      setQrCodeUrl(fresh.qr || null);
      if (onUpdateBot) onUpdateBot(fresh);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao reiniciar a instância.');
    } finally {
      setIsRestarting(false);
    }
  };

  // Disconnect Handler
  const handleDisconnect = async () => {
    if (confirm(`Confirma a desconexão forçada da instância ${bot.name}?`)) {
      setIsDisconnecting(true);
      try {
        if (onDisconnectBot) {
          await onDisconnectBot(bot.id);
        } else {
          await api.saveBotConfig(bot.id, { active: 0 }, clientToken, isAdminMode);
          toast.success('Instância desconectada com sucesso.');
        }
        const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
        if (onUpdateBot) onUpdateBot(fresh);
      } catch (err: any) {
        toast.error(err.message || 'Falha ao desconectar a instância.');
      } finally {
        setIsDisconnecting(false);
      }
    }
  };

  // Reset WhatsApp Session (from modal)
  const handleResetWhatsApp = async () => {
    try {
      setResettingWA(true);
      await api.resetBotSession(bot.id, clientToken, isAdminMode);
      toast.success('Sessão reiniciada! Aguarde a geração de novo QR Code.');
      setConfirmResetOpen(false);
      setTimeout(async () => {
        try {
          const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
          setQrCodeUrl(fresh.qr || null);
          if (onUpdateBot) onUpdateBot(fresh);
        } catch {}
      }, 2000);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao reiniciar WhatsApp');
    } finally {
      setResettingWA(false);
    }
  };

  // Clear Memory
  const handleClearMemory = async () => {
    try {
      setClearingMemory(true);
      const res = await api.clearBotMemory(bot.id, clientToken, isAdminMode);
      toast.success(`Memória limpa com sucesso (${res.clearedCount} mensagens removidas).`);
      setConfirmClearMemory(false);
      setMemoryContacts([]);
      if (stats) setStats({ ...stats, memoryItems: 0, totalMessages: 0 });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao limpar memória');
    } finally {
      setClearingMemory(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/bot/${bot.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Link de acesso seguro copiado! O cliente deverá digitar o PIN.');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const navTabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Visão Geral', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'whatsapp', label: 'Conexão WhatsApp', icon: <QrCode className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'Configurações', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'groups', label: 'Grupos & Regras', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'moderation', label: 'Moderação', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'private', label: 'Privado', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'memory', label: 'Memória', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'knowledge', label: 'Conhecimento', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'automation', label: 'Automação', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'motivation', label: 'Motivação', icon: <SunMedium className="w-3.5 h-3.5" /> },
    { id: 'documents', label: 'Documentos / PDF', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'stats', label: 'Métricas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'logs', label: 'Logs & Auditoria', icon: <Terminal className="w-3.5 h-3.5" /> }
  ];

  const isOnline = bot.active === 1 || bot.status === 'Conectado';

  return (
    <div className="space-y-6 select-none">
      {/* Barra de Navegação Superior / Controle de Ciclo de Vida */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#142340]">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowLeft className="w-3.5 h-3.5" />}
              onClick={onBack}
            >
              Voltar
            </Button>
          )}
          {onBack && <div className="h-4 w-px bg-[#1e355e]" />}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">{bot.name}</h1>
              <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 border border-sky-400/30 px-2 py-0.5 rounded-full">
                ID: {bot.id}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              LINHA: {bot.ownerPhone || 'NÃO CONFIGURADO'} | PROPRIETÁRIO: {bot.ownerName || '—'}
            </p>
          </div>
        </div>

        {/* Ações de Controle da Instância */}
        <div className="flex flex-wrap items-center gap-2">
          {hasChanges && (
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              onClick={handleSave}
              icon={<Save className="w-3.5 h-3.5" />}
            >
              Salvar Alterações
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            icon={copiedLink ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5" />}
            onClick={handleCopyLink}
          >
            {copiedLink ? 'Link Copiado' : 'Link do Cliente'}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCw className="w-3.5 h-3.5" />}
            loading={isRestarting}
            onClick={handleRestart}
          >
            Reiniciar Instância
          </Button>

          <Button
            size="sm"
            variant="danger"
            icon={<Power className="w-3.5 h-3.5" />}
            loading={isDisconnecting}
            onClick={handleDisconnect}
          >
            Forçar Desconexão
          </Button>
        </div>
      </div>

      {/* Cabeçalho de Estado Rápido Cyber */}
      <div className="grid grid-cols-1 md:grid-cols-3 border border-[#162a4d] bg-[#0b1426]/90 backdrop-blur-md divide-y md:divide-y-0 md:divide-x divide-[#142340] rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">ESTADO DO MOTOR</span>
          {isOnline ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shadow-[0_0_6px_#38bdf8]" />
              CONECTADO (ONLINE)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              DESCONECTADO
            </span>
          )}
        </div>

        <div className="p-4 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">MODO DE RESPOSTA</span>
          <div className="flex gap-1.5 text-[10px] font-mono">
            <span className={`px-2.5 py-0.5 rounded-lg border ${bot.respondInPrivate ? 'bg-sky-500/15 text-sky-300 border-sky-400/30 font-semibold' : 'bg-[#081021] text-slate-500 border-[#142340]'}`}>
              PV: {bot.respondInPrivate ? 'SIM' : 'NÃO'}
            </span>
            <span className={`px-2.5 py-0.5 rounded-lg border ${bot.respondInGroups ? 'bg-blue-500/15 text-blue-300 border-blue-400/30 font-semibold' : 'bg-[#081021] text-slate-500 border-[#142340]'}`}>
              GP: {bot.respondInGroups ? 'SIM' : 'NÃO'}
            </span>
          </div>
        </div>

        <div className="p-4 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">MODELO IA</span>
          <span className="text-xs font-mono text-sky-300 font-semibold">
            {bot.aiModel || 'gemini-1.5-flash'}
          </span>
        </div>
      </div>

      {/* Barramento de Abas Técnico Cyber */}
      <div className="border-b border-[#142340] overflow-x-auto scrollbar-none">
        <nav className="flex gap-2 text-xs font-medium whitespace-nowrap min-w-max pb-2">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all ${
                currentTab === tab.id
                  ? 'bg-sky-500 text-white font-semibold shadow-[0_0_12px_rgba(14,165,233,0.35)]'
                  : 'text-slate-400 hover:text-white hover:bg-[#0c1833]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Áreas de Conteúdo das Abas */}
      <div className="pt-2">
        {/* 1. VISÃO GERAL */}
        {currentTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 space-y-4 shadow-lg">
              <div className="text-xs font-semibold text-white">Métricas de Execução da Instância</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="p-4 bg-[#081021] border border-[#142340] rounded-xl">
                  <div className="text-slate-400 text-[11px]">MENSAGENS ENVIADAS</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {stats?.modelMessages ?? bot.messagesSent ?? 0}
                  </div>
                </div>
                <div className="p-4 bg-[#081021] border border-[#142340] rounded-xl">
                  <div className="text-slate-400 text-[11px]">MENSAGENS RECEBIDAS</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {stats?.userMessages ?? bot.messagesReceived ?? 0}
                  </div>
                </div>
                <div className="p-4 bg-[#081021] border border-[#142340] rounded-xl">
                  <div className="text-slate-400 text-[11px]">CONTATOS ÚNICOS</div>
                  <div className="text-xl font-bold text-sky-400 mt-1">
                    {stats?.totalContacts ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Chaves de Comutação Operacional */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Toggle
                label="Instância Bot Ativa"
                description="Quando desativado, o bot não responde a nenhuma mensagem no WhatsApp."
                checked={formData.active === 1}
                onChange={(checked) => handleChange('active', checked ? 1 : 0)}
              />

              <Toggle
                label="Memória de Contexto"
                description="Permite que a IA recorde interações anteriores com cada contato."
                checked={formData.memoryEnabled === 1}
                onChange={(checked) => handleChange('memoryEnabled', checked ? 1 : 0)}
              />

              <Toggle
                label="Respostas no Privado (1 a 1)"
                description="Responder mensagens de contatos diretos no WhatsApp."
                checked={formData.respondInPrivate === 1}
                onChange={(checked) => handleChange('respondInPrivate', checked ? 1 : 0)}
              />

              <Toggle
                label="Respostas em Grupos"
                description="Permitir que o bot interaja em grupos de WhatsApp onde foi adicionado."
                checked={formData.respondInGroups === 1}
                onChange={(checked) => handleChange('respondInGroups', checked ? 1 : 0)}
              />

              <Toggle
                label="Visão & Análise de Mídia"
                description="Processar e interpretar imagens e arquivos PDF com o Gemini Vision."
                checked={formData.analysisEnabled === 1}
                onChange={(checked) => handleChange('analysisEnabled', checked ? 1 : 0)}
              />

              <Toggle
                label="Mensagem de Boas-Vindas Privada"
                description="Enviar saudação automática no primeiro contato do cliente."
                checked={formData.privateWelcomeEnabled === 1}
                onChange={(checked) => handleChange('privateWelcomeEnabled', checked ? 1 : 0)}
              />
            </div>

            {/* Sumário Técnico dos Módulos */}
            <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 space-y-3 shadow-lg">
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-sky-400" />
                <span>Status Operacional dos Módulos</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 bg-[#081021] border border-[#142340] rounded-xl">
                  <span className="text-slate-400 font-mono text-[11px] block">CONEXÃO WHATSAPP</span>
                  <p className="text-white font-mono font-medium mt-1">{bot.status || 'Desconectado'}</p>
                </div>

                <div className="p-3.5 bg-[#081021] border border-[#142340] rounded-xl">
                  <span className="text-slate-400 font-mono text-[11px] block">PIPELINE IA</span>
                  <p className="text-sky-300 font-mono font-medium mt-1">{bot.aiModel || 'gemini-1.5-flash'}</p>
                </div>

                <div className="p-3.5 bg-[#081021] border border-[#142340] rounded-xl">
                  <span className="text-slate-400 font-mono text-[11px] block">ISOLAMENTO MULTI-TENANT</span>
                  <p className="text-white font-mono font-medium mt-1">Sessão Segura & RBAC</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. WHATSAPP & QR CODE */}
        {currentTab === 'whatsapp' && (
          <div className="space-y-6">
            <WhatsAppConnectionTab
              bot={bot}
              qrCodeUrl={qrCodeUrl || undefined}
              connectionStatus={bot.status === 'Conectado' ? 'CONNECTED' : (qrCodeUrl ? 'QR_READY' : 'DISCONNECTED')}
              onRefreshQR={async () => {
                const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
                setQrCodeUrl(fresh.qr || null);
                if (onUpdateBot) onUpdateBot(fresh);
                toast.info('Status de conexão e QR Code atualizados');
              }}
              onDisconnect={async () => {
                try {
                  await api.disconnectBotSession(bot.id, clientToken, isAdminMode);
                  toast.success('Sessão WhatsApp desconectada com sucesso');
                } catch {
                  await api.saveBotConfig(bot.id, { active: 0 }, clientToken, isAdminMode);
                  toast.success('Instância desconectada');
                }
                const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
                setQrCodeUrl(null);
                if (onUpdateBot) onUpdateBot(fresh);
              }}
              onRequestPairingCode={async (phoneNumber) => {
                try {
                  const code = await api.requestPairingCode(bot.id, phoneNumber, clientToken, isAdminMode);
                  toast.success('Código de emparelhamento gerado com sucesso!');
                  return code;
                } catch (e: any) {
                  toast.error(e.message || 'Erro ao gerar código');
                  return null;
                }
              }}
            />
          </div>
        )}

        {/* 3. CONFIGURAÇÕES & INSTRUÇÕES */}
        {currentTab === 'settings' && (
          <div className="space-y-6">
            <ConfigurationTab
              bot={bot}
              onSave={async (updatedData) => {
                try {
                  await api.saveBotConfig(bot.id, updatedData, clientToken, isAdminMode);
                  toast.success('Configurações salvas com sucesso!');
                  if (onUpdateBot) onUpdateBot({ ...bot, ...updatedData } as Bot);
                } catch (e: any) {
                  toast.error(e.message || 'Erro ao salvar configurações');
                  throw e;
                }
              }}
            />
          </div>
        )}

        {/* 4. GRUPOS & REGRAS */}
        {currentTab === 'groups' && (
          <div className="space-y-6">
            <GroupRulesTab
              bot={bot}
              groups={groupList}
              onSaveGlobalRules={async (rules) => {
                try {
                  await api.saveBotConfig(bot.id, {
                    moderationAction: rules.antiLinkAction,
                    antiSpamMaxMessages: rules.antiSpamRateLimit,
                    groupWelcomeMsg: rules.welcomeTemplate
                  }, clientToken, isAdminMode);
                  toast.success('Políticas globais de moderação salvas com sucesso!');
                  if (onUpdateBot) {
                    onUpdateBot({
                      ...bot,
                      moderationAction: rules.antiLinkAction,
                      antiSpamMaxMessages: rules.antiSpamRateLimit,
                      groupWelcomeMsg: rules.welcomeTemplate
                    } as Bot);
                  }
                } catch (e: any) {
                  toast.error(e.message || 'Erro ao salvar regras globais');
                  throw e;
                }
              }}
              onUpdateGroupConfig={async (groupId, config) => {
                try {
                  await api.saveGroupConfig(bot.id, groupId, config, clientToken, isAdminMode);
                  toast.success('Configuração do grupo atualizada!');
                } catch (e: any) {
                  toast.error(e.message || 'Erro ao salvar configuração do grupo');
                }
              }}
            />
          </div>
        )}

        {/* 5. MODERAÇÃO */}
        {currentTab === 'moderation' && (
          <div className="space-y-6">
            <ModerationSettingsCard
              formData={formData}
              onChange={handleChange}
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                loading={saving}
                onClick={handleSave}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Salvar Alterações
              </Button>
            </div>
          </div>
        )}

        {/* 6. PRIVADO */}
        {currentTab === 'private' && (
          <div className="space-y-6">
            <PrivateSettingsCard
              formData={formData}
              onChange={handleChange}
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                loading={saving}
                onClick={handleSave}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Salvar Alterações
              </Button>
            </div>
          </div>
        )}

        {/* 7. MEMÓRIA */}
        {currentTab === 'memory' && (
          <div className="space-y-6">
            <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-6 space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    Histórico e Memória de Conversas
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Contatos com interações persistidas no Firestore para contexto em tempo real.
                  </p>
                </div>

                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setConfirmClearMemory(true)}
                  disabled={memoryContacts.length === 0}
                >
                  Limpar Toda a Memória
                </Button>
              </div>

              {/* Search Filter */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sky-400/60" />
                <input
                  type="text"
                  value={memoryFilter}
                  onChange={(e) => setMemoryFilter(e.target.value)}
                  placeholder="Filtrar por número ou trecho da mensagem..."
                  className="bg-[#081021] border border-[#1b3259] rounded-xl pl-9 pr-3.5 py-2 w-full text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
                />
              </div>

              {loadingTabData ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : memoryContacts.length === 0 ? (
                <EmptyState
                  icon={<Database className="w-6 h-6 text-sky-400" />}
                  title="Nenhuma conversa em memória"
                  description="As conversas recentes dos clientes aparecerão listadas aqui."
                />
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {memoryContacts
                    .filter(
                      (m) =>
                        m.jid.toLowerCase().includes(memoryFilter.toLowerCase()) ||
                        m.lastMessage.toLowerCase().includes(memoryFilter.toLowerCase())
                    )
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-[#081021] border border-[#142340] hover:border-sky-500/30 flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-white">
                              {item.jid.replace('@s.whatsapp.net', '')}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30 font-mono">
                              {item.messageCount} msgs
                            </span>
                          </div>
                          <p className="text-slate-400 truncate text-[11px]">
                            "{item.lastMessage}"
                          </p>
                        </div>

                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {item.lastTimestamp ? new Date(item.lastTimestamp).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 8. BASE DE CONHECIMENTO */}
        {currentTab === 'knowledge' && (
          <div className="space-y-6">
            <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-6 space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    Base de Conhecimento do Assistente
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Adicione dados de FAQ, produtos, tabelas de preços e horários operacionais.
                  </p>
                </div>
                <span className="text-[11px] text-sky-400 font-mono bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-400/20">
                  {(formData.knowledgeBase || '').split(/\s+/).filter(Boolean).length} PALAVRAS
                </span>
              </div>

              <textarea
                rows={12}
                value={formData.knowledgeBase || ''}
                onChange={(e) => handleChange('knowledgeBase', e.target.value)}
                placeholder="Digite ou cole aqui as informações e regras do negócio..."
                className="w-full bg-[#081021] border border-[#1b3259] rounded-xl p-3.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] leading-relaxed resize-y transition-all"
              />

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500">
                  Injetado no contexto conversacional do Gemini para respostas factuais e exatas.
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  onClick={handleSave}
                  icon={<Save className="w-3.5 h-3.5" />}
                >
                  Salvar Base
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 9. AUTOMAÇÃO */}
        {currentTab === 'automation' && (
          <div className="space-y-6">
            <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-6 space-y-4 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">Painel de Automações & Agendamento</h3>
                  <p className="text-[11px] text-slate-400">Disparos programados, gatilhos automáticos e rotinas operacionais</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => handleTabChange('motivation')}
                  className="p-5 rounded-2xl bg-[#081021] border border-[#162a4d] hover:border-sky-400/50 hover:shadow-[0_0_15px_rgba(14,165,233,0.15)] text-left transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 mb-3 group-hover:scale-105 transition-transform">
                    <SunMedium className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-white group-hover:text-sky-300 transition-colors">
                    Mensagens Motivacionais Diárias
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Configurar horários, dias da semana e modo (IA personalizada ou fixo).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange('documents')}
                  className="p-5 rounded-2xl bg-[#081021] border border-[#162a4d] hover:border-sky-400/50 hover:shadow-[0_0_15px_rgba(14,165,233,0.15)] text-left transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-105 transition-transform">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors">
                    Gerador & Emissor de PDF
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Emitir relatórios e documentos diretamente para contatos e grupos do WhatsApp.
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 10. MOTIVAÇÃO */}
        {currentTab === 'motivation' && (
          <div className="space-y-6">
            <MotivationSettingsCard
              formData={formData}
              onChange={handleChange}
              botId={bot.id}
              clientToken={clientToken}
              isAdminMode={isAdminMode}
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                loading={saving}
                onClick={handleSave}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Salvar Alterações
              </Button>
            </div>
          </div>
        )}

        {/* 11. DOCUMENTOS / PDF */}
        {currentTab === 'documents' && (
          <DocumentPdfCard
            botId={bot.id}
            botName={bot.name}
            clientToken={clientToken}
            isAdminMode={isAdminMode}
          />
        )}

        {/* 12. ESTATÍSTICAS / MÉTRICAS */}
        {currentTab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 shadow-lg">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Total de Mensagens
                </span>
                <p className="text-2xl font-mono font-bold text-white mt-2">
                  {stats?.totalMessages ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">Histórico armazenado</p>
              </div>

              <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 shadow-lg">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Contatos Únicos
                </span>
                <p className="text-2xl font-mono font-bold text-white mt-2">
                  {stats?.totalContacts ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">Clientes atendidos</p>
              </div>

              <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 shadow-lg">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Respostas da IA
                </span>
                <p className="text-2xl font-mono font-bold text-sky-400 mt-2">
                  {stats?.modelMessages ?? 0}
                </p>
                <p className="text-[10px] text-sky-400/80 mt-1 font-mono">Respostas geradas</p>
              </div>

              <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 shadow-lg">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Mensagens de Clientes
                </span>
                <p className="text-2xl font-mono font-bold text-white mt-2">
                  {stats?.userMessages ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">Dúvidas recebidas</p>
              </div>
            </div>
          </div>
        )}

        {/* 13. LOGS & AUDITORIA */}
        {currentTab === 'logs' && (
          <div className="space-y-6">
            <BotLogsTab
              botId={bot.id}
              logs={
                auditLogs.map((l, i) => ({
                  id: l.id || `log-${i}`,
                  timestamp: l.createdAt
                    ? typeof l.createdAt === 'string'
                      ? l.createdAt
                      : new Date(l.createdAt).toISOString()
                    : new Date().toISOString(),
                  level:
                    l.result === 'FAILURE' || l.result === 'ERROR' || l.result === 'DENIED'
                      ? 'ERROR'
                      : l.action.includes('WARN') || l.action.includes('ALERT')
                      ? 'WARN'
                      : 'INFO',
                  source: l.action.includes('GEMINI') || l.action.includes('AI')
                    ? 'GEMINI'
                    : l.role === 'ADMIN'
                    ? 'SYSTEM'
                    : 'BAILEYS',
                  message: `${l.action}: ${l.details || l.command || 'Execução registrada'}`,
                  details: l.fieldsChanged
                    ? `Parâmetros alterados: ${l.fieldsChanged.join(', ')}`
                    : undefined
                }))
              }
              onClearLogs={() => setAuditLogs([])}
            />
          </div>
        )}
      </div>

      {/* Modal Confirmar Reset de WhatsApp */}
      <Modal
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Desconectar e Resetar WhatsApp"
        description="A sessão atual do WhatsApp será encerrada e um novo QR Code será gerado."
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Esta ação forçará o encerramento da conexão Baileys e removerá as credenciais locais desta instância.
            Será necessário escanear o QR Code novamente para restabelecer o atendimento.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#142340]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmResetOpen(false)}
              disabled={resettingWA}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={resettingWA}
              onClick={handleResetWhatsApp}
            >
              Confirmar e Resetar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmar Limpeza de Memória */}
      <Modal
        isOpen={confirmClearMemory}
        onClose={() => setConfirmClearMemory(false)}
        title="Limpar Toda a Memória de Conversas"
        description="Esta ação removerá todas as mensagens de histórico deste bot do Firestore."
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            A IA esquecerá todas as mensagens anteriores dos clientes, reiniciando o contexto de conversa do zero.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#142340]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClearMemory(false)}
              disabled={clearingMemory}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={clearingMemory}
              onClick={handleClearMemory}
            >
              Sim, Limpar Memória
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
