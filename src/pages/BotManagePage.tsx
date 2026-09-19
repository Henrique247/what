import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  ActiveTab, 
  BotStats, 
  MemoryContact, 
  AuditLog 
} from '../types';
import { 
  Sliders, 
  QrCode, 
  BookOpen, 
  Brain, 
  MessageSquare, 
  BarChart3, 
  ShieldAlert, 
  Sparkles, 
  Save, 
  RefreshCw, 
  Copy, 
  Check, 
  Trash2, 
  Phone, 
  AlertTriangle,
  Lock,
  Wifi,
  ExternalLink,
  Search,
  CheckCircle2,
  Users,
  Settings,
  Shield,
  SunMedium,
  Radio,
  FileText
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../services/api';
import { GroupControlView } from '../components/GroupControlView';
import { BotSettingsTab } from '../components/settings/BotSettingsTab';
import { PrivateSettingsCard } from '../components/settings/PrivateSettingsCard';
import { ModerationSettingsCard } from '../components/settings/ModerationSettingsCard';
import { MotivationSettingsCard } from '../components/settings/MotivationSettingsCard';
import { DocumentPdfCard } from '../components/DocumentPdfCard';

interface BotManagePageProps {
  bot: Bot;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onUpdateBot: (updatedBot: Bot) => void;
  isAdminMode: boolean;
  clientToken?: string;
}

export const BotManagePage: React.FC<BotManagePageProps> = ({
  bot,
  activeTab,
  onSelectTab,
  onUpdateBot,
  isAdminMode,
  clientToken,
}) => {
  const toast = useToast();

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

  // Search filter for logs & memory
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
        if (activeTab === 'stats') {
          const s = await api.getBotStats(bot.id, clientToken, isAdminMode);
          if (isMounted) setStats(s);
        } else if (activeTab === 'memory') {
          const mem = await api.getBotMemory(bot.id, clientToken, isAdminMode);
          if (isMounted) setMemoryContacts(mem);
        } else if (activeTab === 'logs') {
          const logs = await api.getBotAuditLogs(bot.id, clientToken, isAdminMode);
          if (isMounted) setAuditLogs(logs);
        } else if (activeTab === 'whatsapp') {
          // Refresh bot to get latest QR Code
          const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
          if (isMounted) {
            setQrCodeUrl(fresh.qr || null);
            onUpdateBot(fresh);
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
  }, [activeTab, bot.id]);

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
      onUpdateBot({ ...bot, ...formData } as Bot);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  // Reset WhatsApp Session
  const handleResetWhatsApp = async () => {
    try {
      setResettingWA(true);
      await api.resetBotSession(bot.id, clientToken, isAdminMode);
      toast.success('Sessão reiniciada! Aguarde a geração de novo QR Code.');
      setConfirmResetOpen(false);
      // Wait a moment and fetch updated status
      setTimeout(async () => {
        try {
          const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
          setQrCodeUrl(fresh.qr || null);
          onUpdateBot(fresh);
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

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Visão Geral', icon: <Sliders className="w-4 h-4" /> },
    { id: 'whatsapp', label: 'WhatsApp & QR', icon: <QrCode className="w-4 h-4" /> },
    { id: 'private', label: 'Privado', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'groups', label: 'Grupos', icon: <Users className="w-4 h-4" /> },
    { id: 'moderation', label: 'Moderação', icon: <Shield className="w-4 h-4" /> },
    { id: 'memory', label: 'Memória', icon: <Brain className="w-4 h-4" /> },
    { id: 'knowledge', label: 'Conhecimento', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'motivation', label: 'Motivação', icon: <SunMedium className="w-4 h-4" /> },
    { id: 'stats', label: 'Estatísticas', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'logs', label: 'Auditoria', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'settings', label: 'Configurações', icon: <Settings className="w-4 h-4 text-emerald-400" /> },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Bot Header Card */}
      <div className="techstar-card p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-900 to-[#151A1F] border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xl shadow-md">
              {bot.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {bot.name}
                </h1>
                <Badge
                  variant={
                    bot.status === 'Conectado'
                      ? 'emerald'
                      : bot.status === 'Conectando...'
                      ? 'amber'
                      : 'gray'
                  }
                  dot={bot.status === 'Conectado'}
                >
                  {bot.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-zinc-400">
                <span className="font-mono text-zinc-500">ID: {bot.id}</span>
                <span>•</span>
                <span>
                  Dono: <strong className="text-zinc-300">{bot.ownerName || 'Não atribuído'}</strong>
                </span>
                {bot.ownerPhone && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{bot.ownerPhone}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {hasChanges && (
              <span className="text-xs text-amber-400 font-medium animate-pulse">
                Alterações não salvas
              </span>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="w-4 h-4" />}
              loading={saving}
              onClick={handleSave}
            >
              Salvar Alterações
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              onClick={handleCopyLink}
            >
              Link do Cliente
            </Button>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center gap-1.5 mt-6 pt-4 border-t border-[#22282F] overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT AREAS */}

      {/* 1. VISÃO GERAL & TOGGLES */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Toggle
              label="Bot Ativo"
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

          {/* Quick System Summary Card */}
          <div className="techstar-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Status Operacional dos Módulos</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#151A1F] border border-[#22282F]">
                <span className="text-zinc-500">Conexão WhatsApp</span>
                <p className="text-zinc-200 font-semibold mt-0.5">{bot.status}</p>
              </div>

              <div className="p-3 rounded-lg bg-[#151A1F] border border-[#22282F]">
                <span className="text-zinc-500">Motor de IA</span>
                <p className="text-zinc-200 font-semibold mt-0.5">Gemini 2.5 Flash Ativo</p>
              </div>

              <div className="p-3 rounded-lg bg-[#151A1F] border border-[#22282F]">
                <span className="text-zinc-500">Segurança Multi-Tenant</span>
                <p className="text-zinc-200 font-semibold mt-0.5">Token Isolado & RBAC</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. WHATSAPP & QR CODE */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* QR Card */}
            <div className="techstar-card p-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-zinc-100">
                  Escaneie o QR Code no seu WhatsApp
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm">
                  Abra o WhatsApp no seu smartphone, acesse <strong>Aparelhos Conectados</strong> e aponte a câmera.
                </p>
              </div>

              {bot.status === 'Conectado' ? (
                <div className="w-64 h-64 rounded-2xl bg-[#151A1F] border border-emerald-500/30 flex flex-col items-center justify-center p-6 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Wifi className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-emerald-400">
                      WhatsApp Conectado!
                    </p>
                    <p className="text-xs text-zinc-400">
                      Sua instância está online e pronta para responder clientes.
                    </p>
                  </div>
                </div>
              ) : qrCodeUrl ? (
                <div className="p-4 rounded-2xl bg-white shadow-xl">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code WhatsApp"
                    className="w-56 h-56 rounded-lg"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 rounded-2xl bg-[#151A1F] border border-[#22282F] flex flex-col items-center justify-center p-6 space-y-2">
                  <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin" />
                  <p className="text-xs text-zinc-400">Gerando sessão WhatsApp...</p>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={async () => {
                    const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
                    setQrCodeUrl(fresh.qr || null);
                    onUpdateBot(fresh);
                    toast.info('Status atualizado');
                  }}
                >
                  Atualizar QR Code
                </Button>

                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmResetOpen(true)}
                >
                  Desconectar / Resetar WhatsApp
                </Button>
              </div>
            </div>

            {/* Connection Instructions Card */}
            <div className="space-y-4">
              <div className="techstar-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>Instruções de Emparelhamento</span>
                </h3>

                <ol className="space-y-3 text-xs text-zinc-400 list-decimal list-inside leading-relaxed">
                  <li>Abra o aplicativo do WhatsApp no telefone do bot.</li>
                  <li>Toque no ícone de <strong>Menu (três pontos)</strong> ou <strong>Configurações</strong>.</li>
                  <li>Selecione <strong>Aparelhos Conectados</strong>.</li>
                  <li>Toque em <strong>Conectar um aparelho</strong>.</li>
                  <li>Aponte a câmera para o QR Code exibido ao lado.</li>
                </ol>

                <div className="p-3.5 rounded-xl bg-[#151A1F] border border-[#22282F] space-y-1">
                  <span className="text-[11px] font-semibold text-emerald-400">Dica de Estabilidade:</span>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Recomendamos utilizar o WhatsApp Business para seu assistente. Mantenha o telefone conectado à internet com bateria.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. INTELIGÊNCIA AI & SYSTEM PROMPT */}
      {activeTab === 'intelligence' && (
        <div className="space-y-6">
          <div className="techstar-card p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">
                Personalidade & Instruções do Sistema
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Defina o papel do assistente, diretrizes de conduta, tom de voz e respostas proibidas.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                System Prompt (Prompt Mestre)
              </label>
              <textarea
                rows={8}
                value={formData.systemPrompt || ''}
                onChange={(e) => handleChange('systemPrompt', e.target.value)}
                placeholder="Você é um assistente virtual..."
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-xl p-3.5 text-xs sm:text-sm text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/50 leading-relaxed resize-y"
              />
              <div className="flex justify-between mt-1 text-[11px] text-zinc-500">
                <span>Instruções aplicadas a todas as mensagens recebidas.</span>
                <span>{(formData.systemPrompt || '').length} caracteres</span>
              </div>
            </div>

            {formData.analysisEnabled === 1 && (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Instruções para Análise de Mídia (Imagens e PDFs)
                </label>
                <textarea
                  rows={4}
                  value={formData.analysisInstructions || ''}
                  onChange={(e) => handleChange('analysisInstructions', e.target.value)}
                  placeholder="Instruções para quando o cliente enviar um comprovante, exame, foto de produto ou documento..."
                  className="w-full bg-[#151A1F] border border-[#22282F] rounded-xl p-3.5 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 leading-relaxed resize-y"
                />
              </div>
            )}

            {/* Gemini API Keys Configuration (Admin Only) */}
            {isAdminMode && (
              <div className="p-4 rounded-xl bg-[#151A1F] border border-[#22282F] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Chaves de API Gemini (Protegido - Exclusivo Admin)</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {bot.hasGeminiKeys ? 'Chave Configurada' : 'Padrão do Servidor'}
                  </span>
                </div>
                <input
                  type="password"
                  value={formData.geminiKeys || ''}
                  onChange={(e) => handleChange('geminiKeys', e.target.value)}
                  placeholder="Deixe em branco para usar as chaves mestras do servidor..."
                  className="w-full bg-[#101418] border border-[#22282F] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 font-mono"
                />
                <p className="text-[10px] text-zinc-500">
                  Separe múltiplas chaves por vírgula para balanceamento automático. O cliente nunca visualiza essas chaves.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. BASE DE CONHECIMENTO */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6">
          <div className="techstar-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Base de Conhecimento do Bot
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Adicione perguntas frequentes, tabela de preços, serviços, horários de atendimento e detalhes do negócio.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-mono">
                  {(formData.knowledgeBase || '').split(/\s+/).filter(Boolean).length} palavras
                </span>
              </div>
            </div>

            <textarea
              rows={12}
              value={formData.knowledgeBase || ''}
              onChange={(e) => handleChange('knowledgeBase', e.target.value)}
              placeholder="Digite ou cole aqui a base de conhecimento completa...&#10;&#10;Exemplo:&#10;HORÁRIO DE FUNCIONAMENTO: Segunda a Sexta das 08h às 18h.&#10;PREÇOS: Consulta padrão R$ 150,00.&#10;ENDEREÇO: Av. Paulista, 1000 - São Paulo."
              className="w-full bg-[#151A1F] border border-[#22282F] rounded-xl p-4 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 leading-relaxed font-sans resize-y"
            />

            <div className="p-3.5 rounded-xl bg-[#151A1F] border border-[#22282F] flex items-center justify-between text-xs text-zinc-400">
              <span>
                Essa base de conhecimento é injetada no contexto de cada conversa com inteligência para responder dúvidas precisas.
              </span>
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                onClick={handleSave}
              >
                Salvar Base
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MEMÓRIA DE CONTEXTO */}
      {activeTab === 'memory' && (
        <div className="space-y-6">
          <div className="techstar-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Histórico e Memória de Conversas
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Visualização dos contatos com interações gravadas no Firestore para manter o contexto.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={() => setConfirmClearMemory(true)}
                  disabled={memoryContacts.length === 0}
                >
                  Limpar Toda a Memória
                </Button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={memoryFilter}
                onChange={(e) => setMemoryFilter(e.target.value)}
                placeholder="Filtrar por número ou trecho da última mensagem..."
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {loadingTabData ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : memoryContacts.length === 0 ? (
              <EmptyState
                icon={<Brain className="w-8 h-8" />}
                title="Nenhuma conversa em memória"
                description="Quando os clientes enviarem mensagens pelo WhatsApp, o histórico de contexto aparecerá listado aqui."
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
                      className="p-3 rounded-xl bg-[#151A1F] border border-[#22282F] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-zinc-200">
                            {item.jid.replace('@s.whatsapp.net', '')}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            {item.messageCount} msgs
                          </span>
                        </div>
                        <p className="text-zinc-400 truncate">
                          "{item.lastMessage}"
                        </p>
                      </div>

                      <span className="text-[11px] text-zinc-500 shrink-0 font-mono">
                        {item.lastTimestamp ? new Date(item.lastTimestamp).toLocaleDateString() : ''}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. CONTROLE E AUTOMAÇÃO DE GRUPOS */}
      {activeTab === 'groups' && (
        <div className="space-y-8">
          <GroupControlView
            botId={bot.id}
            botStatus={bot.status}
            clientToken={clientToken}
            isAdminMode={isAdminMode}
          />

          {/* Configurações Globais de Mensagens Rápidas */}
          <div className="pt-6 border-t border-[#22282F] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  Mensagens Padrão Globais do Bot
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Mensagens automáticas utilizadas quando não houver regra específica configurada para o chat individual ou grupo.
                </p>
              </div>

              <Button
                variant="primary"
                size="sm"
                loading={saving}
                onClick={handleSave}
              >
                Salvar Mensagens
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form de Mensagens */}
              <div className="techstar-card p-6 space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Mensagem de Boas-Vindas (Privado)
                    </label>
                    <input
                      type="text"
                      value={formData.welcomeMsg || ''}
                      onChange={(e) => handleChange('welcomeMsg', e.target.value)}
                      placeholder="Ex: Olá! Seja bem-vindo à nossa empresa."
                      className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Mensagem de Despedida (!sair no Privado)
                    </label>
                    <input
                      type="text"
                      value={formData.exitMsg || ''}
                      onChange={(e) => handleChange('exitMsg', e.target.value)}
                      placeholder="Ex: Atendimento finalizado. Até logo!"
                      className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Mensagem Padrão de Boas-Vindas (Grupos)
                    </label>
                    <input
                      type="text"
                      value={formData.groupWelcomeMsg || ''}
                      onChange={(e) => handleChange('groupWelcomeMsg', e.target.value)}
                      placeholder="Ex: Olá grupo! Sou o assistente virtual da TechStar."
                      className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Live WhatsApp Preview Balloon */}
              <div className="techstar-card p-6 flex flex-col justify-between space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">
                    Pré-visualização no WhatsApp
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Veja exatamente como a mensagem de boas-vindas privada é exibida.
                  </p>
                </div>

                {/* Chat Canvas */}
                <div className="rounded-2xl bg-[#0B141A] p-4 border border-[#22282F] flex flex-col justify-end min-h-[180px] relative overflow-hidden">
                  <div className="space-y-3">
                    <div className="flex justify-start">
                      <div className="bg-[#202C33] text-zinc-200 text-xs px-3.5 py-2 rounded-2xl rounded-tl-xs max-w-[80%] shadow-xs">
                        Olá, gostaria de saber mais informações.
                        <span className="block text-[9px] text-zinc-400 text-right mt-1">10:42</span>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <div className="bg-[#005C4B] text-white text-xs px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[80%] shadow-xs">
                        {formData.welcomeMsg || 'Olá! Como posso te ajudar hoje?'}
                        <span className="block text-[9px] text-emerald-200/70 text-right mt-1">
                          10:42 ✓✓
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 text-center">
                  Mensagens formatadas automaticamente respeitando quebras de linha.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. ESTATÍSTICAS */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="techstar-card p-5">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Total de Mensagens
              </span>
              <p className="text-3xl font-bold text-white mt-2">
                {stats?.totalMessages ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Histórico armazenado</p>
            </div>

            <div className="techstar-card p-5">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Contatos Únicos
              </span>
              <p className="text-3xl font-bold text-white mt-2">
                {stats?.totalContacts ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Clientes atendidos</p>
            </div>

            <div className="techstar-card p-5">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Mensagens da IA
              </span>
              <p className="text-3xl font-bold text-white mt-2">
                {stats?.modelMessages ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Respostas geradas</p>
            </div>

            <div className="techstar-card p-5">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Mensagens de Clientes
              </span>
              <p className="text-3xl font-bold text-white mt-2">
                {stats?.userMessages ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Dúvidas recebidas</p>
            </div>
          </div>
        </div>
      )}

      {/* 8. LOGS DE AUDITORIA */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="techstar-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Logs de Auditoria & Acessos
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Registro criptográfico e isolado de todas as operações administrativas e comandos do WhatsApp.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  placeholder="Filtrar por ação ou autor..."
                  className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {loadingTabData ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : auditLogs.length === 0 ? (
              <EmptyState
                icon={<ShieldAlert className="w-8 h-8" />}
                title="Nenhum log registrado"
                description="Todas as alterações de configuração, conexões e comandos do WhatsApp serão gravadas aqui com auditoria completa."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#151A1F] text-zinc-400 font-medium uppercase text-[10px] tracking-wider border-b border-[#22282F]">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Ação</th>
                      <th className="py-2.5 px-3">Papel</th>
                      <th className="py-2.5 px-3">Detalhes</th>
                      <th className="py-2.5 px-3 text-right">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#22282F]">
                    {auditLogs
                      .filter(
                        (l) =>
                          l.action.toLowerCase().includes(logFilter.toLowerCase()) ||
                          (l.details && l.details.toLowerCase().includes(logFilter.toLowerCase())) ||
                          l.role.toLowerCase().includes(logFilter.toLowerCase())
                      )
                      .map((log, idx) => (
                        <tr key={idx} className="hover:bg-[#151A1F]/50 transition-colors">
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                log.result === 'SUCCESS'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {log.result}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-zinc-100">
                            {log.action}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-zinc-400">
                            {log.role}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300 max-w-md truncate">
                            {log.details || log.command || 'Execução autorizada'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-zinc-500 font-mono">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. CONFIGURAÇÕES COMPLETAS DO BOT (NOVA ABA SAAS) */}
      {activeTab === 'settings' && (
        <BotSettingsTab
          bot={bot}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
          onUpdateBot={onUpdateBot}
          onNavigateToTab={onSelectTab}
          stats={stats}
        />
      )}

      {/* 10. CONVERSAS PRIVADAS (1:1) */}
      {activeTab === 'private' && (
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
              icon={<Save className="w-4 h-4" />}
            >
              Salvar Alterações
            </Button>
          </div>
        </div>
      )}

      {/* 11. MODERAÇÃO DE CONTEÚDO */}
      {activeTab === 'moderation' && (
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
              icon={<Save className="w-4 h-4" />}
            >
              Salvar Alterações
            </Button>
          </div>
        </div>
      )}

      {/* 12. MOTIVAÇÃO E MENSAGENS AUTOMÁTICAS */}
      {activeTab === 'motivation' && (
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
              icon={<Save className="w-4 h-4" />}
            >
              Salvar Alterações
            </Button>
          </div>
        </div>
      )}

      {/* 13. AUTOMAÇÃO & DISPAROS */}
      {activeTab === 'automation' && (
        <div className="space-y-6">
          <div className="techstar-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Painel de Automações & Agendamento</h3>
                <p className="text-xs text-zinc-400">Configure disparos programados, gatilhos por palavras-chave e motivação diária</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => onSelectTab('motivation')}
                className="p-4 rounded-xl bg-[#101418] border border-[#22282F] hover:border-emerald-500/30 text-left transition-all group"
              >
                <SunMedium className="w-5 h-5 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                <h4 className="text-xs font-semibold text-zinc-200">Mensagens Motivacionais Diárias</h4>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Programar horários, dias da semana e modo (IA ou fixo).
                </p>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('documents')}
                className="p-4 rounded-xl bg-[#101418] border border-[#22282F] hover:border-emerald-500/30 text-left transition-all group"
              >
                <FileText className="w-5 h-5 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                <h4 className="text-xs font-semibold text-zinc-200">Gerador & Emissor de PDF</h4>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Criar documentos e relatórios e enviar diretamente pelo WhatsApp.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 14. DOCUMENTOS E PDF */}
      {activeTab === 'documents' && (
        <DocumentPdfCard
          botId={bot.id}
          botName={bot.name}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
        />
      )}

      {/* Modal Confirmar Reset de WhatsApp */}
      <Modal
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Desconectar e Resetar WhatsApp"
        description="A sessão atual do WhatsApp será encerrada e um novo QR Code será gerado."
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-300">
            Esta ação forçará o encerramento da conexão Baileys e removerá as credenciais locais desta instância.
            Será necessário escanear o QR Code novamente para restabelecer o atendimento.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#22282F]">
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
          <p className="text-xs text-zinc-300">
            A IA esquecerá todas as mensagens anteriores dos clientes, reiniciando o contexto de conversa do zero.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#22282F]">
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
