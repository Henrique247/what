import React from 'react';
import { 
  Bot as BotIcon, 
  Wifi, 
  MessageSquare, 
  Users, 
  ArrowUpRight, 
  ShieldCheck, 
  PlusCircle, 
  ExternalLink,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Bot, AdminStats } from '../types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { StatCardSkeleton, Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

interface DashboardPageProps {
  stats: AdminStats | null;
  bots: Bot[];
  loading: boolean;
  onSelectBot: (bot: Bot) => void;
  onNavigateToBots: () => void;
  onOpenCreateModal: () => void;
  isAdminMode: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  bots,
  loading,
  onSelectBot,
  onNavigateToBots,
  onOpenCreateModal,
  isAdminMode,
}) => {
  const onlineBotsCount = bots.filter((b) => b.status === 'Conectado').length;
  const activeBotsCount = bots.filter((b) => b.active === 1).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#101418] via-[#131920] to-[#101418] border border-[#22282F] p-6 sm:p-8">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="emerald" dot>
                Plataforma Multi-Bot SaaS
              </Badge>
              <span className="text-xs text-zinc-500 font-mono">v2.4 Pro</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Painel de Controle TechStar
            </h1>
            <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
              Monitore suas instâncias de WhatsApp, gerencie inteligências artificiais com Gemini, 
              acompanhe memória de contexto e audite interações em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdminMode && (
              <Button
                variant="primary"
                icon={<PlusCircle className="w-4 h-4" />}
                onClick={onOpenCreateModal}
              >
                Criar Novo Bot
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<BotIcon className="w-4 h-4" />}
              onClick={onNavigateToBots}
            >
              Ver Todos os Bots ({bots.length})
            </Button>
          </div>
        </div>

        {/* Decorative Grid Line */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            {/* Card 1: Total de Bots */}
            <div className="techstar-card p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Total de Bots
                </span>
                <div className="w-9 h-9 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                  <BotIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {bots.length}
                </span>
                <span className="text-xs text-emerald-400 font-medium">
                  {activeBotsCount} ativos
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Instâncias criadas no sistema</p>
            </div>

            {/* Card 2: Bots Online no WhatsApp */}
            <div className="techstar-card p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Conexões WhatsApp
                </span>
                <div className="w-9 h-9 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                  <Wifi className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {onlineBotsCount}
                </span>
                <span className="text-xs text-zinc-400">
                  / {bots.length} instâncias
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${onlineBotsCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                <p className="text-xs text-zinc-500">
                  {onlineBotsCount > 0 ? 'Instâncias respondendo' : 'Nenhuma sessão conectada'}
                </p>
              </div>
            </div>

            {/* Card 3: Mensagens Processadas */}
            <div className="techstar-card p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Mensagens Processadas
                </span>
                <div className="w-9 h-9 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                  <MessageSquare className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {stats?.totalMessages ?? 0}
                </span>
                <span className="text-xs text-zinc-400">mensagens</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Histórico de contexto real gravado</p>
            </div>

            {/* Card 4: Utilizadores Atendidos */}
            <div className="techstar-card p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Utilizadores Atendidos
                </span>
                <div className="w-9 h-9 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {stats?.totalUsers ?? 0}
                </span>
                <span className="text-xs text-zinc-400">contatos únicos</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Pessoas atendidas no WhatsApp</p>
            </div>
          </>
        )}
      </div>

      {/* Main Content Grid: Bots Recentes & Atividade de Auditoria */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Bots em Destaque */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">
                Assistentes WhatsApp em Operação
              </h3>
              <p className="text-xs text-zinc-400">
                Clique em qualquer bot para abrir o painel individual de gestão
              </p>
            </div>
            <button
              onClick={onNavigateToBots}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
            >
              <span>Ver todos</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : bots.length === 0 ? (
            <EmptyState
              icon={<BotIcon className="w-6 h-6" />}
              title="Nenhum bot cadastrado"
              description="Crie o seu primeiro assistente WhatsApp inteligente para começar a atender clientes 24/7."
              actionLabel={isAdminMode ? "Criar Primeiro Bot" : undefined}
              onAction={onOpenCreateModal}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {bots.slice(0, 4).map((bot) => (
                <div
                  key={bot.id}
                  onClick={() => onSelectBot(bot)}
                  className="techstar-card p-4 hover:border-emerald-500/40 cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center justify-center text-emerald-400 font-bold text-xs group-hover:border-emerald-500/30">
                          {bot.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">
                            {bot.name}
                          </h4>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            ID: {bot.id}
                          </span>
                        </div>
                      </div>

                      <Badge
                        variant={bot.status === 'Conectado' ? 'emerald' : 'gray'}
                        dot={bot.status === 'Conectado'}
                      >
                        {bot.status}
                      </Badge>
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-3">
                      {bot.systemPrompt || "Assistente virtual configurado para atendimento ágil."}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#22282F]/70 flex items-center justify-between text-xs text-zinc-400">
                    <span className="text-[11px]">
                      Dono: <strong className="text-zinc-300 font-medium">{bot.ownerName || 'Não definido'}</strong>
                    </span>
                    <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform text-[11px] font-medium flex items-center gap-1">
                      Gerenciar →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Logs de Auditoria Recentes */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">
                Segurança & Auditoria
              </h3>
              <p className="text-xs text-zinc-400">
                Últimas ações e validações de acesso
              </p>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">Tempo Real</span>
          </div>

          <div className="techstar-card p-4 space-y-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !stats?.recentActivity || stats.recentActivity.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Nenhum evento registrado ainda. As ações do painel e comandos via WhatsApp aparecem aqui automaticamente.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {stats.recentActivity.slice(0, 6).map((log, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                          log.result === 'SUCCESS' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {log.result}
                        </span>
                        <span className="font-semibold text-zinc-200 truncate">
                          {log.action}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {log.details || log.command || 'Execução registrada'}
                      </p>
                    </div>

                    <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                      {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
