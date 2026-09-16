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
    const tokenPart = bot.accessToken ? `?token=${bot.accessToken}` : '';
    const fullUrl = `${window.location.origin}/manage/${bot.id}${tokenPart}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedTokenId(bot.id);
    toast.success('Link seguro do cliente copiado!');
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
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Meus Bots de WhatsApp
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
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
      <div className="p-3 rounded-xl bg-[#101418] border border-[#22282F] flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por nome, ID ou proprietário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
            }`}
          >
            Todos ({bots.length})
          </button>
          <button
            onClick={() => setStatusFilter('online')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'online'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
            }`}
          >
            Online ({bots.filter((b) => b.status === 'Conectado').length})
          </button>
          <button
            onClick={() => setStatusFilter('offline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'offline'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
            }`}
          >
            Offline ({bots.filter((b) => b.status !== 'Conectado').length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
            }`}
          >
            Ativos ({bots.filter((b) => b.active === 1).length})
          </button>
        </div>
      </div>

      {/* Bot Cards Grid */}
      {filteredBots.length === 0 ? (
        <EmptyState
          icon={<BotIcon className="w-8 h-8" />}
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
              className="techstar-card p-5 flex flex-col justify-between hover:border-emerald-500/30 transition-all duration-200 group relative"
            >
              {/* Header: Avatar, Name, Status, Quick Actions */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-950 to-[#151A1F] border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base shadow-sm">
                      {bot.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-base text-zinc-100 group-hover:text-emerald-400 transition-colors">
                        {bot.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-mono text-zinc-500">
                          ID: {bot.id}
                        </span>
                      </div>
                    </div>
                  </div>

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

                {/* System Prompt / Description preview */}
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4">
                  {bot.systemPrompt || 'Assistente com atendimento inteligente configurado.'}
                </p>

                {/* Status Badges & Capabilities */}
                <div className="grid grid-cols-2 gap-2 mb-4 p-2.5 rounded-lg bg-[#151A1F] border border-[#22282F] text-[11px]">
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span>{bot.active ? 'Sistema Ativo' : 'Sistema Pausado'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.memoryEnabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span>{bot.memoryEnabled ? 'Memória ON' : 'Memória OFF'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.respondInGroups ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span>{bot.respondInGroups ? 'Grupos ON' : 'Grupos OFF'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${bot.analysisEnabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span>{bot.analysisEnabled ? 'Visão IA ON' : 'Visão OFF'}</span>
                  </div>
                </div>

                {/* Owner info */}
                <div className="text-xs text-zinc-400 mb-4 flex items-center justify-between">
                  <span>
                    Proprietário: <strong className="text-zinc-200">{bot.ownerName || 'Não configurado'}</strong>
                  </span>
                  {bot.ownerPhone && (
                    <span className="font-mono text-[11px] text-zinc-500">
                      {bot.ownerPhone}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#22282F] space-y-2">
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
                        className={`p-2 rounded-lg border transition-colors ${
                          bot.active
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40'
                            : 'bg-zinc-800/40 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>

                      {/* Copy Client Link */}
                      <button
                        onClick={(e) => handleCopyClientLink(bot, e)}
                        title="Copiar Link Seguro para o Cliente"
                        className="p-2 rounded-lg bg-[#151A1F] border border-[#22282F] text-zinc-400 hover:text-zinc-200 hover:border-[#2E3742] transition-colors"
                      >
                        {copiedTokenId === bot.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
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
                        className="p-2 rounded-lg bg-rose-950/20 border border-rose-500/20 text-rose-400 hover:bg-rose-950/40 transition-colors"
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
          <p className="text-sm text-zinc-300">
            Você tem certeza que deseja excluir o bot{' '}
            <strong className="text-white font-semibold">{botToDelete?.name}</strong>?
          </p>
          <p className="text-xs text-zinc-400">
            A sessão do WhatsApp será desconectada e as credenciais associadas serão removidas com segurança.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#22282F]">
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
