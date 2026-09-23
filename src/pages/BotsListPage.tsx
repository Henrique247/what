import React, { useState } from 'react';
import { 
  Bot as BotIcon, 
  Search, 
  Filter, 
  PlusCircle, 
  Power, 
  RefreshCw, 
  Trash2, 
  Key, 
  Sliders, 
  Copy, 
  Check, 
  ExternalLink,
  Shield,
  MessageSquare,
  Sparkles,
  Wifi
} from 'lucide-react';
import { Bot } from '../types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

interface BotsListPageProps {
  bots: Bot[];
  loading: boolean;
  onSelectBot: (bot: Bot) => void;
  onToggleBot: (botId: string) => Promise<void>;
  onDeleteBot: (botId: string) => Promise<void>;
  onRegenerateToken: (botId: string) => Promise<string | void>;
  onOpenCreateModal: () => void;
  isAdminMode: boolean;
}

export const BotsListPage: React.FC<BotsListPageProps> = ({
  bots,
  loading,
  onSelectBot,
  onToggleBot,
  onDeleteBot,
  onRegenerateToken,
  onOpenCreateModal,
  isAdminMode,
}) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'active'>('all');
  
  // Modals state
  const [botToDelete, setBotToDelete] = useState<Bot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // Filter bots
  const filteredBots = bots.filter((bot) => {
    const matchesSearch = 
      bot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bot.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (bot.ownerName && bot.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'online') return bot.status === 'Conectado';
    if (statusFilter === 'offline') return bot.status !== 'Conectado';
    if (statusFilter === 'active') return bot.active === 1;
    return true;
  });

  const handleCopyClientLink = (bot: Bot, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${window.location.origin}/bot/${bot.id}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedTokenId(bot.id);
    toast.success('Link do bot copiado!');
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const handleConfirmDelete = async () => {
    if (!botToDelete) return;
    try {
      setDeleting(true);
      await onDeleteBot(botToDelete.id);
      setBotToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#142340]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Meus Bots de WhatsApp
            </h1>
            <div className="h-4 w-px bg-[#1e355e]" />
            <span className="text-xs font-mono text-sky-400 font-semibold tracking-wider">INSTÂNCIAS ATIVAS</span>
          </div>
          <div className="w-16 h-0.5 bg-gradient-to-r from-sky-400 to-blue-600 rounded-full mt-1.5" />
          <p className="text-xs text-slate-400 mt-1">
            Gerencie instâncias, conexões e inteligência artificial dos seus assistentes.
          </p>
        </div>

        {isAdminMode && (
          <Button
            variant="primary"
            icon={<PlusCircle className="w-4 h-4" />}
            onClick={onOpenCreateModal}
          >
            Criar Novo Bot
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 rounded-2xl bg-[#0b1426]/90 border border-[#162a4d] flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400/70" />
          <input
            type="text"
            placeholder="Buscar por nome, ID ou proprietário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#081021] border border-[#1b3259] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] transition-all font-mono"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-sky-500 text-white font-semibold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-[#0c1833]'
            }`}
          >
            Todos ({bots.length})
          </button>
          <button
            onClick={() => setStatusFilter('online')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              statusFilter === 'online'
                ? 'bg-sky-500 text-white font-semibold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-[#0c1833]'
            }`}
          >
            Online ({bots.filter((b) => b.status === 'Conectado').length})
          </button>
          <button
            onClick={() => setStatusFilter('offline')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              statusFilter === 'offline'
                ? 'bg-sky-500 text-white font-semibold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-[#0c1833]'
            }`}
          >
            Offline ({bots.filter((b) => b.status !== 'Conectado').length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              statusFilter === 'active'
                ? 'bg-sky-500 text-white font-semibold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-[#0c1833]'
            }`}
          >
            Ativos ({bots.filter((b) => b.active === 1).length})
          </button>
        </div>
      </div>

      {/* Bot Cards Grid */}
      {filteredBots.length === 0 ? (
        <EmptyState
          icon={<BotIcon className="w-8 h-8 text-sky-400" />}
          title={searchTerm ? 'Nenhum bot encontrado com os filtros atuais' : 'Nenhum bot cadastrado'}
          description={
            searchTerm
              ? 'Tente ajustar sua busca ou limpar os filtros de status.'
              : 'Comece criando uma nova instância de bot do WhatsApp com inteligência artificial.'
          }
          actionLabel={!searchTerm && isAdminMode ? 'Criar Primeiro Bot' : undefined}
          onAction={onOpenCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredBots.map((bot) => (
            <div
              key={bot.id}
              className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 flex flex-col justify-between hover:border-sky-500/50 hover:shadow-[0_8px_30px_-8px_rgba(14,165,233,0.25)] transition-all duration-200 group relative"
            >
              {/* Header: Avatar, Name, Status, Quick Actions */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-base shadow-[0_0_12px_rgba(14,165,233,0.3)]">
                      {bot.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-base text-white group-hover:text-sky-300 transition-colors">
                        {bot.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-mono text-slate-400">
                          ID: {bot.id}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant={
                      bot.status === 'Conectado'
                        ? 'cyan'
                        : bot.status === 'Conectando...'
                        ? 'amber'
                        : 'gray'
                    }
                    dot={bot.status === 'Conectado'}
                  >
                    {bot.status}
                  </Badge>
                </div>

                {/* System Prompt / Description preview */}
                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-4">
                  {bot.systemPrompt || 'Assistente com atendimento inteligente configurado.'}
                </p>

                {/* Status Badges & Capabilities */}
                <div className="grid grid-cols-2 gap-2 mb-4 p-2.5 rounded-xl bg-[#081021] border border-[#142340] text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.active ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]' : 'bg-slate-600'}`} />
                    <span>{bot.active ? 'Sistema Ativo' : 'Sistema Pausado'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.memoryEnabled ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]' : 'bg-slate-600'}`} />
                    <span>{bot.memoryEnabled ? 'Memória ON' : 'Memória OFF'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.respondInGroups ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]' : 'bg-slate-600'}`} />
                    <span>{bot.respondInGroups ? 'Grupos ON' : 'Grupos OFF'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.analysisEnabled ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]' : 'bg-slate-600'}`} />
                    <span>{bot.analysisEnabled ? 'Visão IA ON' : 'Visão OFF'}</span>
                  </div>
                </div>

                {/* Owner info */}
                <div className="text-xs text-slate-400 mb-4 flex items-center justify-between">
                  <span>
                    Proprietário: <strong className="text-slate-200">{bot.ownerName || 'Não configurado'}</strong>
                  </span>
                  {bot.ownerPhone && (
                    <span className="font-mono text-[11px] text-sky-400">
                      {bot.ownerPhone}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#142340] space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => onSelectBot(bot)}
                  >
                    Gerenciar Bot
                  </Button>

                  {isAdminMode && (
                    <>
                      {/* Toggle Active */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBot(bot.id);
                        }}
                        title={bot.active ? 'Pausar Bot' : 'Ativar Bot'}
                        className={`p-2 rounded-xl border transition-all ${
                          bot.active
                            ? 'bg-sky-500/15 border-sky-400/30 text-sky-300 hover:bg-sky-500/25'
                            : 'bg-[#081021] border-[#142340] text-slate-400 hover:text-white'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>

                      {/* Copy Client Link */}
                      <button
                        onClick={(e) => handleCopyClientLink(bot, e)}
                        title="Copiar Link Seguro para o Cliente"
                        className="p-2 rounded-xl bg-[#081021] border border-[#142340] text-slate-400 hover:text-sky-300 hover:border-sky-400/30 transition-all"
                      >
                        {copiedTokenId === bot.id ? (
                          <Check className="w-4 h-4 text-sky-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      {/* Delete Modal Trigger */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBotToDelete(bot);
                        }}
                        title="Excluir Bot"
                        className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      <Modal
        isOpen={!!botToDelete}
        onClose={() => setBotToDelete(null)}
        title="Excluir Instância do Bot"
        description="Esta ação é permanente e não poderá ser desfeita."
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Você tem certeza que deseja excluir o bot{' '}
            <strong className="text-white font-semibold">{botToDelete?.name}</strong>?
          </p>
          <p className="text-xs text-slate-400">
            A sessão do WhatsApp será desconectada e as credenciais associadas serão removidas com segurança.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#142340]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBotToDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={handleConfirmDelete}
            >
              Sim, Excluir Bot
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
