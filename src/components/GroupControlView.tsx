import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Settings, 
  Users, 
  AlertTriangle, 
  Sparkles, 
  Clock, 
  Link as LinkIcon, 
  MessageSquare, 
  UserX, 
  Check, 
  X, 
  Plus, 
  RefreshCw, 
  Search, 
  Send, 
  FileText, 
  History, 
  Trash2, 
  ExternalLink,
  Crown,
  Lock,
  Globe
} from 'lucide-react';
import { GroupConfig, GroupWarning, GroupLog } from '../types';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Toggle } from './ui/Toggle';
import { Modal } from './ui/Modal';
import { useToast } from './ui/Toast';
import { Skeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';
import { api } from '../services/api';

interface GroupControlViewProps {
  botId: string;
  botStatus?: string;
  clientToken?: string;
  isAdminMode?: boolean;
}

interface GroupSummary {
  groupId: string;
  groupName: string;
  groupDesc?: string;
  participantCount: number;
  botIsAdmin: boolean;
  config: GroupConfig;
}

const DEFAULT_BAD_WORDS = [
  'fraude', 'golpe', 'piramide', 'cripto gratis', 'ganhe dinheiro facil', 
  'esquema', 'hack', 'vaza', 'link suspeito', 'pix em dobro'
];

export const GroupControlView: React.FC<GroupControlViewProps> = ({
  botId,
  botStatus,
  clientToken,
  isAdminMode = true,
}) => {
  const toast = useToast();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAdminOnly, setFilterAdminOnly] = useState(false);

  // Active Selected Group for Configuration Modal
  const [selectedGroup, setSelectedGroup] = useState<GroupSummary | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'moderation' | 'messages' | 'automation' | 'ai'>('moderation');
  const [groupFormData, setGroupFormData] = useState<Partial<GroupConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingMotivation, setTestingMotivation] = useState(false);

  // Allowed Link & Bad Word Input States
  const [newAllowedLink, setNewAllowedLink] = useState('');
  const [newBadWord, setNewBadWord] = useState('');

  // Warnings Modal State
  const [warningsModalOpen, setWarningsModalOpen] = useState(false);
  const [groupWarnings, setGroupWarnings] = useState<GroupWarning[]>([]);
  const [loadingWarnings, setLoadingWarnings] = useState(false);
  const [clearingWarning, setClearingWarning] = useState<string | null>(null);

  // Logs Modal State
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [groupLogs, setGroupLogs] = useState<GroupLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Load Groups List
  const loadGroups = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await api.getBotGroups(botId, clientToken, isAdminMode);
      setGroups(data);
      if (isManualRefresh) {
        toast.success('Lista de grupos sincronizada com sucesso!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao carregar grupos do WhatsApp');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [botId]);

  // Open Configuration Modal
  const handleOpenConfig = (group: GroupSummary) => {
    setSelectedGroup(group);
    setGroupFormData({ ...group.config });
    setModalTab('moderation');
    setConfigModalOpen(true);
  };

  // Save Group Configuration
  const handleSaveConfig = async () => {
    if (!selectedGroup) return;
    try {
      setSavingConfig(true);
      const res = await api.saveGroupConfig(botId, selectedGroup.groupId, groupFormData, clientToken, isAdminMode);
      toast.success('Configurações do grupo salvas com sucesso!');

      // Update local state
      setGroups(prev => prev.map(g => {
        if (g.groupId === selectedGroup.groupId) {
          return { ...g, config: res.config };
        }
        return g;
      }));

      setSelectedGroup(prev => prev ? { ...prev, config: res.config } : null);
      setConfigModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar configuração do grupo');
    } finally {
      setSavingConfig(false);
    }
  };

  // Test Motivation Dispatch
  const handleTestMotivation = async () => {
    if (!selectedGroup) return;
    try {
      setTestingMotivation(true);
      const res = await api.testGroupMotivation(botId, selectedGroup.groupId, clientToken, isAdminMode);
      toast.success('Mensagem motivacional enviada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar mensagem de teste');
    } finally {
      setTestingMotivation(false);
    }
  };

  // Open Warnings Modal
  const handleOpenWarnings = async (group: GroupSummary) => {
    setSelectedGroup(group);
    setWarningsModalOpen(true);
    setLoadingWarnings(true);
    try {
      const warns = await api.getGroupWarnings(botId, group.groupId, clientToken, isAdminMode);
      setGroupWarnings(warns);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao carregar advertências');
    } finally {
      setLoadingWarnings(false);
    }
  };

  // Clear Warnings for a Member or All
  const handleResetWarnings = async (participantPhone?: string) => {
    if (!selectedGroup) return;
    try {
      setClearingWarning(participantPhone || 'ALL');
      await api.resetGroupWarnings(botId, selectedGroup.groupId, participantPhone, clientToken, isAdminMode);
      toast.success(participantPhone ? 'Advertências do membro zeradas!' : 'Todas as advertências do grupo foram zeradas!');
      
      // Reload warnings list
      const updated = await api.getGroupWarnings(botId, selectedGroup.groupId, clientToken, isAdminMode);
      setGroupWarnings(updated);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao zerar advertências');
    } finally {
      setClearingWarning(null);
    }
  };

  // Open Logs Modal
  const handleOpenLogs = async (group: GroupSummary) => {
    setSelectedGroup(group);
    setLogsModalOpen(true);
    setLoadingLogs(true);
    try {
      const logs = await api.getGroupLogs(botId, group.groupId, clientToken, isAdminMode);
      setGroupLogs(logs);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao carregar logs do grupo');
    } finally {
      setLoadingLogs(false);
    }
  };

  // Add Bad Word
  const handleAddBadWord = () => {
    const word = newBadWord.trim().toLowerCase();
    if (!word) return;
    const current = groupFormData.badWords || [];
    if (!current.includes(word)) {
      setGroupFormData({ ...groupFormData, badWords: [...current, word] });
    }
    setNewBadWord('');
  };

  // Remove Bad Word
  const handleRemoveBadWord = (word: string) => {
    const current = groupFormData.badWords || [];
    setGroupFormData({ ...groupFormData, badWords: current.filter(w => w !== word) });
  };

  // Load Preset Bad Words
  const handleLoadDefaultBadWords = () => {
    const current = groupFormData.badWords || [];
    const merged = Array.from(new Set([...current, ...DEFAULT_BAD_WORDS]));
    setGroupFormData({ ...groupFormData, badWords: merged });
    toast.info('Palavras padrão adicionadas à lista.');
  };

  // Add Allowed Link
  const handleAddAllowedLink = () => {
    const link = newAllowedLink.trim().toLowerCase();
    if (!link) return;
    const current = groupFormData.allowedLinks || [];
    if (!current.includes(link)) {
      setGroupFormData({ ...groupFormData, allowedLinks: [...current, link] });
    }
    setNewAllowedLink('');
  };

  // Remove Allowed Link
  const handleRemoveAllowedLink = (link: string) => {
    const current = groupFormData.allowedLinks || [];
    setGroupFormData({ ...groupFormData, allowedLinks: current.filter(l => l !== link) });
  };

  // Filtered Groups
  const filteredGroups = groups.filter(g => {
    const matchesSearch = 
      g.groupName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      g.groupId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAdmin = filterAdminOnly ? g.botIsAdmin : true;
    return matchesSearch && matchesAdmin;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner Card */}
      <div className="techstar-card p-6 bg-gradient-to-r from-[#101418] via-[#151A1F] to-[#101418] border border-[#22282F] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Shield className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Módulo de Automação & Segurança</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Gestão Inteligente de Grupos WhatsApp
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Transforme seu bot em um administrador inteligente. Modere mensagens, bloqueie links e spam, envie motivação diária com IA e configure regras personalizadas por grupo.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
              onClick={() => loadGroups(true)}
              loading={refreshing}
            >
              Sincronizar Grupos
            </Button>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#22282F]">
          <div className="bg-[#0B0E12]/60 p-3 rounded-xl border border-[#22282F]">
            <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider block">Grupos Conectados</span>
            <span className="text-lg sm:text-xl font-bold text-white mt-0.5 block">{groups.length}</span>
          </div>

          <div className="bg-[#0B0E12]/60 p-3 rounded-xl border border-[#22282F]">
            <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider block">Bot Administrador</span>
            <span className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5 block">
              {groups.filter(g => g.botIsAdmin).length}
            </span>
          </div>

          <div className="bg-[#0B0E12]/60 p-3 rounded-xl border border-[#22282F]">
            <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider block">Moderação Ativa</span>
            <span className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5 block">
              {groups.filter(g => g.config?.antiLinkEnabled || g.config?.antiBadWordsEnabled || g.config?.antiSpamEnabled).length}
            </span>
          </div>

          <div className="bg-[#0B0E12]/60 p-3 rounded-xl border border-[#22282F]">
            <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider block">Motivação Diária</span>
            <span className="text-lg sm:text-xl font-bold text-cyan-400 mt-0.5 block">
              {groups.filter(g => g.config?.dailyMotivationEnabled).length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar grupo por nome ou ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="techstar-input pl-9 text-xs w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setFilterAdminOnly(!filterAdminOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              filterAdminOnly 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                : 'bg-[#151A1F] text-zinc-400 border-[#22282F] hover:text-zinc-200'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Apenas Bot Admin</span>
          </button>
        </div>
      </div>

      {/* Groups Grid / List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="techstar-card p-5 space-y-4">
              <Skeleton className="h-6 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
              <div className="pt-4 border-t border-[#22282F] flex justify-between">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="techstar-card p-12 text-center">
          <EmptyState
            title="Nenhum grupo encontrado"
            description={
              searchTerm 
                ? "Nenhum grupo corresponde à sua busca." 
                : "O bot ainda não participa de nenhum grupo no WhatsApp ou o WhatsApp está desconectado."
            }
            icon={<Users className="w-10 h-10 text-zinc-500" />}
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => loadGroups(true)}
              >
                Recarregar Grupos
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map(group => {
            const isModActive = group.config?.antiLinkEnabled || group.config?.antiBadWordsEnabled || group.config?.antiSpamEnabled;
            const isMotivationActive = group.config?.dailyMotivationEnabled;

            return (
              <div 
                key={group.groupId} 
                className="techstar-card p-5 flex flex-col justify-between border border-[#22282F] hover:border-emerald-500/30 transition-all group"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Badge
                      variant={group.botIsAdmin ? 'emerald' : 'amber'}
                      dot={group.botIsAdmin}
                    >
                      {group.botIsAdmin ? 'Bot Admin' : 'Membro Comum'}
                    </Badge>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                      <Users className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{group.participantCount} membros</span>
                    </div>
                  </div>

                  {/* Group Title */}
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                    {group.groupName}
                  </h3>
                  <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate">
                    {group.groupId}
                  </p>

                  {/* Module Indicators */}
                  <div className="mt-4 pt-3 border-t border-[#22282F] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-zinc-500" />
                        Moderação Inteligente:
                      </span>
                      <span className={`font-semibold ${isModActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {isModActive ? 'Ativa' : 'Desativada'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
                        Motivação Diária:
                      </span>
                      <span className={`font-semibold ${isMotivationActive ? 'text-cyan-400' : 'text-zinc-500'}`}>
                        {isMotivationActive ? `${group.config?.dailyMotivationTime || '08:00'}` : 'Desativada'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
                        Boas-vindas:
                      </span>
                      <span className={`font-semibold ${group.config?.welcomeEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {group.config?.welcomeEnabled ? 'Ativa' : 'Padrão do Bot'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom Actions */}
                <div className="mt-5 pt-4 border-t border-[#22282F] flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    icon={<Settings className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenConfig(group)}
                  >
                    Configurar
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<AlertTriangle className="w-3.5 h-3.5" />}
                    title="Ver Advertências"
                    onClick={() => handleOpenWarnings(group)}
                  />

                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<History className="w-3.5 h-3.5" />}
                    title="Logs de Moderação"
                    onClick={() => handleOpenLogs(group)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. MODAL DE CONFIGURAÇÃO DO GRUPO                        */}
      {/* ======================================================== */}
      <Modal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title={selectedGroup?.groupName || 'Configuração do Grupo'}
        description={`ID: ${selectedGroup?.groupId}`}
        maxWidth="3xl"
      >
        <div className="space-y-5">
          {/* Admin Status Warning Banner if bot is not admin */}
          {!selectedGroup?.botIsAdmin && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300">
                <p className="font-semibold">O Bot não é administrador deste grupo no WhatsApp.</p>
                <p className="text-amber-300/80 mt-0.5">
                  Para que o bot consiga apagar mensagens inadequadas e remover membros infratores, promova o número do bot a <strong>Administrador do Grupo</strong> no WhatsApp.
                </p>
              </div>
            </div>
          )}

          {/* Modal Tab Buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0B0E12] rounded-xl border border-[#22282F] overflow-x-auto">
            <button
              onClick={() => setModalTab('moderation')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                modalTab === 'moderation'
                  ? 'bg-[#151A1F] text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Moderação Inteligente</span>
            </button>

            <button
              onClick={() => setModalTab('messages')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                modalTab === 'messages'
                  ? 'bg-[#151A1F] text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Regras & Boas-Vindas</span>
            </button>

            <button
              onClick={() => setModalTab('automation')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                modalTab === 'automation'
                  ? 'bg-[#151A1F] text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Motivação Diária (IA)</span>
            </button>

            <button
              onClick={() => setModalTab('ai')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                modalTab === 'ai'
                  ? 'bg-[#151A1F] text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Respostas de IA</span>
            </button>
          </div>

          {/* TAB 1: MODERAÇÃO INTELIGENTE */}
          {modalTab === 'moderation' && (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
              {/* Anti-Link Card */}
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <Toggle
                  label="Filtro Anti-Link"
                  description="Detecta links (http, https, wa.me, t.me) enviados por membros comuns."
                  checked={groupFormData.antiLinkEnabled ?? true}
                  onChange={(checked) => setGroupFormData({ ...groupFormData, antiLinkEnabled: checked })}
                />

                {(groupFormData.antiLinkEnabled ?? true) && (
                  <div className="space-y-3 pt-3 border-t border-[#22282F]/60">
                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                        Ação ao Detectar Link Não Permitido
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'delete', label: 'Apenas Apagar' },
                          { id: 'delete_and_warn', label: 'Apagar & Advertir' },
                          { id: 'remove', label: 'Expulsar Direto' }
                        ].map(act => (
                          <button
                            key={act.id}
                            type="button"
                            onClick={() => setGroupFormData({ ...groupFormData, antiLinkAction: act.id as any })}
                            className={`p-2.5 rounded-lg text-xs font-medium border text-center transition-all ${
                              (groupFormData.antiLinkAction || 'delete_and_warn') === act.id
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                                : 'bg-[#151A1F] text-zinc-400 border-[#22282F] hover:text-zinc-200'
                            }`}
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block mb-1">
                        Links e Domínios Permitidos (Exceções)
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          placeholder="Ex: youtube.com, techstar.ao"
                          value={newAllowedLink}
                          onChange={(e) => setNewAllowedLink(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAllowedLink())}
                          className="techstar-input text-xs flex-1"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Plus className="w-4 h-4" />}
                          onClick={handleAddAllowedLink}
                        >
                          Adicionar
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {(groupFormData.allowedLinks || []).map(link => (
                          <span
                            key={link}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#151A1F] text-xs text-zinc-300 border border-[#22282F]"
                          >
                            <Globe className="w-3 h-3 text-emerald-400" />
                            <span>{link}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAllowedLink(link)}
                              className="text-zinc-500 hover:text-rose-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {(groupFormData.allowedLinks || []).length === 0 && (
                          <span className="text-xs text-zinc-500 italic">Nenhum link permitido. Todos os links serão bloqueados.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Anti-Palavras Proibidas Card */}
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <Toggle
                  label="Filtro Anti-Palavras Proibidas"
                  description="Bloqueia mensagens com palavras ofensivas, golpes ou termos proibidos."
                  checked={groupFormData.antiBadWordsEnabled ?? true}
                  onChange={(checked) => setGroupFormData({ ...groupFormData, antiBadWordsEnabled: checked })}
                />

                {(groupFormData.antiBadWordsEnabled ?? true) && (
                  <div className="space-y-3 pt-3 border-t border-[#22282F]/60">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Lista de Palavras Proibidas
                      </label>
                      <button
                        type="button"
                        onClick={handleLoadDefaultBadWords}
                        className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        Carregar Lista Padrão
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Digite um termo e pressione Adicionar..."
                        value={newBadWord}
                        onChange={(e) => setNewBadWord(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBadWord())}
                        className="techstar-input text-xs flex-1"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={handleAddBadWord}
                      >
                        Adicionar
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-[#12161B] rounded-lg border border-[#22282F]">
                      {(groupFormData.badWords || []).map(word => (
                        <span
                          key={word}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-xs text-rose-300 border border-rose-500/20"
                        >
                          <span>{word}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveBadWord(word)}
                            className="text-rose-400/60 hover:text-rose-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {(groupFormData.badWords || []).length === 0 && (
                        <span className="text-xs text-zinc-500 italic p-1">Nenhum termo cadastrado.</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Anti-Spam / Anti-Flood Card */}
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <Toggle
                  label="Anti-Spam & Anti-Flood"
                  description="Protege contra envio massivo de mensagens repetidas em poucos segundos."
                  checked={groupFormData.antiSpamEnabled ?? true}
                  onChange={(checked) => setGroupFormData({ ...groupFormData, antiSpamEnabled: checked })}
                />

                {(groupFormData.antiSpamEnabled ?? true) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#22282F]/60">
                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block mb-1">
                        Máximo de Mensagens
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="20"
                        value={groupFormData.antiSpamMaxMessages ?? 4}
                        onChange={(e) => setGroupFormData({ ...groupFormData, antiSpamMaxMessages: parseInt(e.target.value) || 4 })}
                        className="techstar-input text-xs w-full"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block mb-1">
                        Janela de Tempo (segundos)
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="60"
                        value={groupFormData.antiSpamTimeWindowSeconds ?? 5}
                        onChange={(e) => setGroupFormData({ ...groupFormData, antiSpamTimeWindowSeconds: parseInt(e.target.value) || 5 })}
                        className="techstar-input text-xs w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Limite de Advertências e Imunidade */}
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Sistema de Advertências</h4>
                    <p className="text-[11px] text-zinc-400">
                      Quando um membro atinge o limite de avisos, ele é removido do grupo.
                    </p>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={groupFormData.maxWarnings ?? 3}
                      onChange={(e) => setGroupFormData({ ...groupFormData, maxWarnings: parseInt(e.target.value) || 3 })}
                      className="techstar-input text-xs text-center font-bold"
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Imunidade Automática:</strong> Administradores do grupo e o proprietário do bot nunca recebem advertências nem são removidos.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REGRAS & BOAS-VINDAS */}
          {modalTab === 'messages' && (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
              {/* Regras do Grupo */}
              <div className="techstar-card p-4 space-y-2.5 bg-[#0E1217] border border-[#22282F]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Regras Oficiais do Grupo
                  </label>
                  <span className="text-[11px] text-zinc-500 font-mono">Disponível via /regras</span>
                </div>
                <textarea
                  rows={4}
                  placeholder="Ex: 1. Respeite todos os membros\n2. Não envie links sem autorização\n3. Mantenha o foco no tema..."
                  value={groupFormData.rulesText || ''}
                  onChange={(e) => setGroupFormData({ ...groupFormData, rulesText: e.target.value })}
                  className="techstar-textarea text-xs w-full"
                />
              </div>

              {/* Mensagem de Boas-Vindas */}
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <Toggle
                  label="Mensagem de Boas-Vindas Customizada"
                  description="Enviada no grupo sempre que um novo participante entra."
                  checked={groupFormData.welcomeEnabled ?? true}
                  onChange={(checked) => setGroupFormData({ ...groupFormData, welcomeEnabled: checked })}
                />

                {(groupFormData.welcomeEnabled ?? true) && (
                  <div className="space-y-2.5 pt-3 border-t border-[#22282F]/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">
                        Use a tag <code className="text-emerald-400 font-bold">@user</code> para mencionar o novo membro.
                      </span>
                    </div>

                    <textarea
                      rows={3}
                      placeholder="Olá @user! Seja muito bem-vindo(a) ao nosso grupo! Leia as /regras."
                      value={groupFormData.welcomeMessage || ''}
                      onChange={(e) => setGroupFormData({ ...groupFormData, welcomeMessage: e.target.value })}
                      className="techstar-textarea text-xs w-full"
                    />

                    {/* Live Preview */}
                    <div className="p-3 rounded-lg bg-[#080B0E] border border-[#22282F] text-xs">
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1">Preview WhatsApp:</span>
                      <p className="text-zinc-300 italic whitespace-pre-wrap">
                        {(groupFormData.welcomeMessage || 'Olá @user! Bem-vindo ao grupo!').replace(/@user/g, '@João')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Mensagem de Despedida / Saída */}
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <Toggle
                  label="Mensagem de Saída de Membro"
                  description="Envia aviso no grupo quando um participante sai ou é removido."
                  checked={groupFormData.exitEnabled ?? false}
                  onChange={(checked) => setGroupFormData({ ...groupFormData, exitEnabled: checked })}
                />

                {(groupFormData.exitEnabled ?? false) && (
                  <div className="space-y-2 pt-3 border-t border-[#22282F]/60">
                    <textarea
                      rows={2}
                      placeholder="@user saiu do grupo."
                      value={groupFormData.exitMessage || ''}
                      onChange={(e) => setGroupFormData({ ...groupFormData, exitMessage: e.target.value })}
                      className="techstar-textarea text-xs w-full"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MOTIVAÇÃO DIÁRIA (IA) */}
          {modalTab === 'automation' && (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <Toggle
                  label="Mensagem Diária Motivacional Automática"
                  description="Envia uma mensagem gerada com IA (Gemini) todas as manhãs no horário programado."
                  checked={groupFormData.dailyMotivationEnabled ?? false}
                  onChange={(checked) => setGroupFormData({ ...groupFormData, dailyMotivationEnabled: checked })}
                />

                {(groupFormData.dailyMotivationEnabled ?? false) && (
                  <div className="space-y-4 pt-3 border-t border-[#22282F]/60">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-zinc-300 block mb-1">
                          Horário de Disparo (HH:MM)
                        </label>
                        <input
                          type="time"
                          value={groupFormData.dailyMotivationTime || '08:00'}
                          onChange={(e) => setGroupFormData({ ...groupFormData, dailyMotivationTime: e.target.value })}
                          className="techstar-input text-xs w-full font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-zinc-300 block mb-1">
                          Fuso Horário Oficial
                        </label>
                        <select
                          value={groupFormData.dailyMotivationTimezone || 'Africa/Luanda'}
                          onChange={(e) => setGroupFormData({ ...groupFormData, dailyMotivationTimezone: e.target.value })}
                          className="techstar-input text-xs w-full"
                        >
                          <option value="Africa/Luanda">África / Luanda (GMT+1)</option>
                          <option value="Europe/Lisbon">Europa / Lisboa (GMT+0 / GMT+1)</option>
                          <option value="America/Sao_Paulo">América / São Paulo (GMT-3)</option>
                          <option value="UTC">UTC Universal</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block mb-1">
                        Tema ou Tópico da Mensagem
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Motivação empresarial, foco em vendas, disciplina e metas"
                        value={groupFormData.dailyMotivationTopic || ''}
                        onChange={(e) => setGroupFormData({ ...groupFormData, dailyMotivationTopic: e.target.value })}
                        className="techstar-input text-xs w-full"
                      />
                      <span className="text-[11px] text-zinc-500 mt-1 block">
                        A IA irá personalizar as mensagens para refletir este tema sem ser repetitiva.
                      </span>
                    </div>

                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={<Send className="w-3.5 h-3.5" />}
                        loading={testingMotivation}
                        onClick={handleTestMotivation}
                      >
                        Disparar Mensagem de Teste Agora no WhatsApp
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: RESPOSTAS DE IA NO GRUPO */}
          {modalTab === 'ai' && (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
              <div className="techstar-card p-4 space-y-3 bg-[#0E1217] border border-[#22282F]">
                <div>
                  <label className="text-xs font-bold text-white block mb-1.5">
                    Modo de Disparo do Bot no Grupo
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGroupFormData({ ...groupFormData, aiRespondTrigger: 'mention_only' })}
                      className={`p-3 rounded-lg text-left border transition-all ${
                        (groupFormData.aiRespondTrigger || 'mention_only') === 'mention_only'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : 'bg-[#151A1F] text-zinc-400 border-[#22282F] hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        <span className="font-semibold text-xs">Mencionou ou Respondeu</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Recomendado: O bot só fala quando marcado (@bot) ou quando respondem a uma mensagem dele.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGroupFormData({ ...groupFormData, aiRespondTrigger: 'all_messages' })}
                      className={`p-3 rounded-lg text-left border transition-all ${
                        groupFormData.aiRespondTrigger === 'all_messages'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : 'bg-[#151A1F] text-zinc-400 border-[#22282F] hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-xs">Todas as Mensagens</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        O bot analisa cada mensagem do grupo. Cuidado: maior consumo de tokens da API Gemini.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#22282F]">
                  <label className="text-xs font-bold text-white block mb-1">
                    Instruções Específicas / Persona para Este Grupo
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Ex: Neste grupo, atue como moderador formal e tire dúvidas sobre produtos da Techstar..."
                    value={groupFormData.customAiInstructions || ''}
                    onChange={(e) => setGroupFormData({ ...groupFormData, customAiInstructions: e.target.value })}
                    className="techstar-textarea text-xs w-full"
                  />
                  <span className="text-[11px] text-zinc-500 mt-1 block">
                    Complementa o System Prompt global do bot com orientações específicas para os membros deste grupo.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-[#22282F] flex items-center justify-end gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfigModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Check className="w-4 h-4" />}
              loading={savingConfig}
              onClick={handleSaveConfig}
            >
              Salvar Alterações
            </Button>
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* 2. MODAL DE ADVERTÊNCIAS DOS MEMBROS                     */}
      {/* ======================================================== */}
      <Modal
        isOpen={warningsModalOpen}
        onClose={() => setWarningsModalOpen(false)}
        title={`Advertências | ${selectedGroup?.groupName}`}
        description="Membros que violaram regras de links, palavras ou spam."
        maxWidth="lg"
      >
        <div className="space-y-4">
          {loadingWarnings ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : groupWarnings.length === 0 ? (
            <div className="py-8 text-center text-zinc-400 text-xs">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-zinc-300">Nenhuma advertência ativa!</p>
              <p className="text-zinc-500 mt-0.5">Todos os membros deste grupo estão com histórico limpo.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {groupWarnings.map(w => (
                <div 
                  key={w.id || w.participantPhone}
                  className="p-3 rounded-xl bg-[#12161B] border border-[#22282F] flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white">
                        +{w.participantPhone}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        {w.count} / {selectedGroup?.config?.maxWarnings || 3} avisos
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-400 mt-1 space-y-0.5">
                      {(w.reasons || []).slice(-2).map((r, i) => (
                        <p key={i} className="line-clamp-1">• {r}</p>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    loading={clearingWarning === w.participantPhone}
                    onClick={() => handleResetWarnings(w.participantPhone)}
                  >
                    Zerar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {groupWarnings.length > 0 && (
            <div className="pt-3 border-t border-[#22282F] flex justify-end">
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                loading={clearingWarning === 'ALL'}
                onClick={() => handleResetWarnings()}
              >
                Zerar Todas as Advertências
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* 3. MODAL DE LOGS DE MODERAÇÃO DO GRUPO                   */}
      {/* ======================================================== */}
      <Modal
        isOpen={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        title={`Histórico de Moderação | ${selectedGroup?.groupName}`}
        description="Ações automáticas e manuais registradas pelo bot."
        maxWidth="xl"
      >
        <div className="space-y-4">
          {loadingLogs ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ) : groupLogs.length === 0 ? (
            <div className="py-8 text-center text-zinc-400 text-xs">
              <History className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-zinc-300">Nenhum registro ainda</p>
              <p className="text-zinc-500 mt-0.5">Eventos de moderação e automação aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {groupLogs.map(log => {
                const isViolation = log.action.includes('LINK') || log.action.includes('BAD_WORD') || log.action.includes('SPAM') || log.action.includes('BANNED');
                const isMotivation = log.action.includes('MOTIVATION');

                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-[#12161B] border border-[#22282F] text-xs flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded ${
                          isViolation 
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : isMotivation
                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}>
                          {log.action}
                        </span>

                        {log.actor && (
                          <span className="text-zinc-400 font-mono text-[11px]">
                            Por: {log.actor}
                          </span>
                        )}
                      </div>

                      <p className="text-zinc-300 mt-1">
                        {log.details || 'Ação executada com sucesso.'}
                      </p>

                      {log.targetUser && (
                        <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          Alvo: +{log.targetUser}
                        </p>
                      )}
                    </div>

                    <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
