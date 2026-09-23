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

  // Stats, Memory, Logs state
  const [stats, setStats] = useState<BotStats | null>(null);
  const [memoryContacts, setMemoryContacts] = useState<MemoryContact[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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
    const token = bot.accessToken || clientToken || '';
    const url = `${window.location.origin}/manage/${bot.id}?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Link do cliente copiado!');
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E2228]">
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
          {onBack && <div className="h-4 w-[1px] bg-[#1E2228]" />}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-[#ECEED0] tracking-tight">{bot.name}</h1>
              <span className="text-[10px] font-mono text-[#626B79] bg-[#16191E] border border-[#2A2F37] px-1.5 py-0.5 rounded-[4px]">
                ID: {bot.id}
              </span>
            </div>
            <p className="text-xs font-mono text-[#626B79] mt-0.5">
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
            icon={copiedLink ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
            onClick={handleCopyLink}
          >
            Link do Cliente
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

      {/* Cabeçalho de Estado Rápido */}
      <div className="grid grid-cols-1 md:grid-cols-3 border border-[#1E2228] bg-[#101216] divide-y md:divide-y-0 md:divide-x divide-[#1E2228] rounded-[6px]">
        <div className="p-3.5 flex items-center justify-between">
          <span className="text-xs font-mono text-[#626B79]">ESTADO DO MOTOR</span>
          {isOnline ? (
            <span className="badge-status bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              CONECTADO (ONLINE)
            </span>
          ) : (
            <span className="badge-status bg-[#6B7280]/10 text-[#9DA4B0] border border-[#6B7280]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6B7280]" />
              DESCONECTADO
            </span>
          )}
        </div>

        <div className="p-3.5 flex items-center justify-between">
          <span className="text-xs font-mono text-[#626B79]">MODO DE RESPOSTA</span>
          <div className="flex gap-1.5 text-[10px] font-mono">
            <span className={`px-2 py-0.5 rounded-[4px] border ${bot.respondInPrivate ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' : 'bg-[#16191E] text-[#626B79] border-[#2A2F37]'}`}>
              PV: {bot.respondInPrivate ? 'SIM' : 'NÃO'}
            </span>
            <span className={`px-2 py-0.5 rounded-[4px] border ${bot.respondInGroups ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' : 'bg-[#16191E] text-[#626B79] border-[#2A2F37]'}`}>
              GP: {bot.respondInGroups ? 'SIM' : 'NÃO'}
            </span>
          </div>
        </div>

        <div className="p-3.5 flex items-center justify-between">
          <span className="text-xs font-mono text-[#626B79]">MODELO IA</span>
          <span className="text-xs font-mono text-[#ECEED0]">
            {bot.aiModel || 'gemini-1.5-flash'}
          </span>
        </div>
      </div>

      {/* Barramento de Abas Técnico */}
      <div className="border-b border-[#1E2228] overflow-x-auto scrollbar-none">
        <nav className="flex gap-6 text-xs font-medium whitespace-nowrap min-w-max">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
                currentTab === tab.id
                  ? 'border-[#059669] text-[#ECEED0]'
                  : 'border-transparent text-[#626B79] hover:text-[#9DA4B0]'
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
            <div className="panel p-4 space-y-4">
              <div className="text-xs font-semibold text-[#ECEED0]">Métricas de Execução da Instância</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
                  <div className="text-[#626B79]">MENSAGENS ENVIADAS</div>
                  <div className="text-lg font-semibold text-[#ECEED0] mt-1">
                    {stats?.modelMessages ?? bot.messagesSent ?? 0}
                  </div>
                </div>
                <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
                  <div className="text-[#626B79]">MENSAGENS RECEBIDAS</div>
                  <div className="text-lg font-semibold text-[#ECEED0] mt-1">
                    {stats?.userMessages ?? bot.messagesReceived ?? 0}
                  </div>
                </div>
                <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
                  <div className="text-[#626B79]">CONTATOS ÚNICOS</div>
                  <div className="text-lg font-semibold text-[#10B981] mt-1">
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
            <div className="panel p-4 space-y-3">
              <div className="text-xs font-semibold text-[#ECEED0] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Status Operacional dos Módulos</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
                  <span className="text-[#626B79] font-mono text-[11px]">CONEXÃO WHATSAPP</span>
                  <p className="text-[#ECEED0] font-mono font-medium mt-1">{bot.status || 'Desconectado'}</p>
                </div>

                <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
                  <span className="text-[#626B79] font-mono text-[11px]">PIPELINE IA</span>
                  <p className="text-[#ECEED0] font-mono font-medium mt-1">{bot.aiModel || 'gemini-1.5-flash'}</p>
                </div>

                <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
                  <span className="text-[#626B79] font-mono text-[11px]">ISOLAMENTO MULTI-TENANT</span>
                  <p className="text-[#ECEED0] font-mono font-medium mt-1">Sessão Segura & RBAC</p>
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
            <div className="panel p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-[#ECEED0]">
                    Histórico e Memória de Conversas
                  </h3>
                  <p className="text-[11px] text-[#626B79] mt-0.5">
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#626B79]" />
                <input
                  type="text"
                  value={memoryFilter}
                  onChange={(e) => setMemoryFilter(e.target.value)}
                  placeholder="Filtrar por número ou trecho da mensagem..."
                  className="techstar-input w-full pl-9 text-xs"
                />
              </div>

              {loadingTabData ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : memoryContacts.length === 0 ? (
                <EmptyState
                  icon={<Database className="w-6 h-6" />}
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
                        className="p-3 rounded-[4px] bg-[#090A0C] border border-[#1E2228] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-[#ECEED0]">
                              {item.jid.replace('@s.whatsapp.net', '')}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-[2px] bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 font-mono">
                              {item.messageCount} msgs
                            </span>
                          </div>
                          <p className="text-[#9DA4B0] truncate text-[11px]">
                            "{item.lastMessage}"
                          </p>
                        </div>

                        <span className="text-[10px] text-[#626B79] shrink-0 font-mono">
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
            <div className="panel p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-[#ECEED0]">
                    Base de Conhecimento do Assistente
                  </h3>
                  <p className="text-[11px] text-[#626B79] mt-0.5">
                    Adicione dados de FAQ, produtos, tabelas de preços e horários operacionais.
                  </p>
                </div>
                <span className="text-[11px] text-[#626B79] font-mono">
                  {(formData.knowledgeBase || '').split(/\s+/).filter(Boolean).length} PALAVRAS
                </span>
              </div>

              <textarea
                rows={12}
                value={formData.knowledgeBase || ''}
                onChange={(e) => handleChange('knowledgeBase', e.target.value)}
                placeholder="Digite ou cole aqui as informações e regras do negócio..."
                className="techstar-input w-full font-mono text-xs leading-relaxed resize-y"
              />

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-[#626B79]">
                  Injetado no contexto conversacional do Gemini para respostas factuais.
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
            <div className="panel p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/20 flex items-center justify-center text-[#10B981]">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-[#ECEED0]">Painel de Automações & Agendamento</h3>
                  <p className="text-[11px] text-[#626B79]">Disparos programados, gatilhos automáticos e rotinas diárias</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => handleTabChange('motivation')}
                  className="p-4 rounded-[4px] bg-[#090A0C] border border-[#1E2228] hover:border-[#10B981]/30 text-left transition-colors"
                >
                  <SunMedium className="w-4 h-4 text-[#10B981] mb-2" />
                  <h4 className="text-xs font-semibold text-[#ECEED0]">Mensagens Motivacionais Diárias</h4>
                  <p className="text-[11px] text-[#626B79] mt-1">
                    Configurar horários, dias da semana e modo (IA ou fixo).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange('documents')}
                  className="p-4 rounded-[4px] bg-[#090A0C] border border-[#1E2228] hover:border-[#10B981]/30 text-left transition-colors"
                >
                  <FileText className="w-4 h-4 text-[#10B981] mb-2" />
                  <h4 className="text-xs font-semibold text-[#ECEED0]">Gerador & Emissor de PDF</h4>
                  <p className="text-[11px] text-[#626B79] mt-1">
                    Emitir relatórios e documentos diretamente para contatos e grupos.
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
              <div className="panel p-4">
                <span className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">
                  Total de Mensagens
                </span>
                <p className="text-xl font-mono font-semibold text-[#ECEED0] mt-2">
                  {stats?.totalMessages ?? 0}
                </p>
                <p className="text-[10px] text-[#626B79] mt-1 font-mono">Histórico armazenado</p>
              </div>

              <div className="panel p-4">
                <span className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">
                  Contatos Únicos
                </span>
                <p className="text-xl font-mono font-semibold text-[#ECEED0] mt-2">
                  {stats?.totalContacts ?? 0}
                </p>
                <p className="text-[10px] text-[#626B79] mt-1 font-mono">Clientes atendidos</p>
              </div>

              <div className="panel p-4">
                <span className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">
                  Respostas da IA
                </span>
                <p className="text-xl font-mono font-semibold text-[#10B981] mt-2">
                  {stats?.modelMessages ?? 0}
                </p>
                <p className="text-[10px] text-[#10B981] mt-1 font-mono">Respostas geradas</p>
              </div>

              <div className="panel p-4">
                <span className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">
                  Mensagens de Clientes
                </span>
                <p className="text-xl font-mono font-semibold text-[#ECEED0] mt-2">
                  {stats?.userMessages ?? 0}
                </p>
                <p className="text-[10px] text-[#626B79] mt-1 font-mono">Dúvidas recebidas</p>
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
                auditLogs.length > 0
                  ? auditLogs.map((l, i) => ({
                      id: l.id || `log-${i}`,
                      timestamp: l.createdAt
                        ? typeof l.createdAt === 'string'
                          ? l.createdAt
                          : new Date(l.createdAt).toISOString()
                        : new Date().toISOString(),
                      level:
                        l.result === 'FAILURE'
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
                  : undefined
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
          <p className="text-xs text-[#9DA4B0] leading-relaxed">
            Esta ação forçará o encerramento da conexão Baileys e removerá as credenciais locais desta instância.
            Será necessário escanear o QR Code novamente para restabelecer o atendimento.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E2228]">
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
          <p className="text-xs text-[#9DA4B0] leading-relaxed">
            A IA esquecerá todas as mensagens anteriores dos clientes, reiniciando o contexto de conversa do zero.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E2228]">
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
