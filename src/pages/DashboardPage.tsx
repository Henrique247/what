import React from 'react';
import { Bot, AdminStats } from '../types';
import { Button } from '../components/ui/Button';
import { Plus, ArrowUpRight } from 'lucide-react';

interface DashboardPageProps {
  stats: AdminStats | null;
  bots: Bot[];
  loading: boolean;
  onSelectBot: (bot: Bot) => void;
  onNavigateToBots?: () => void;
  onOpenCreateModal: () => void;
  isAdminMode?: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  bots,
  loading,
  onSelectBot,
  onOpenCreateModal
}) => {
  const activeBotsCount = bots.filter(b => b.active === 1 || b.status === 'Conectado').length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho de Comando */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1E2228]">
        <div>
          <h1 className="text-base font-semibold text-[#ECEED0] tracking-tight">Console de Operações</h1>
          <p className="text-xs text-[#626B79] mt-0.5">Gestão das instâncias do WhatsApp e pipelines de IA ativas.</p>
        </div>
        <Button 
          size="sm" 
          variant="primary" 
          icon={<Plus className="w-3.5 h-3.5" />} 
          onClick={onOpenCreateModal}
        >
          Nova Instância Bot
        </Button>
      </div>

      {/* Grelha Tabular de Métricas Chave */}
      <div className="grid grid-cols-1 md:grid-cols-4 border border-[#1E2228] bg-[#101216] divide-y md:divide-y-0 md:divide-x divide-[#1E2228] rounded-[6px]">
        <div className="p-4">
          <div className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">Total de Instâncias</div>
          <div className="text-xl font-mono font-semibold text-[#ECEED0] mt-2">{bots.length}</div>
          <div className="text-[10px] text-[#9DA4B0] mt-1 font-mono">{activeBotsCount} ativas em execução</div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">Mensagens Processadas</div>
          <div className="text-xl font-mono font-semibold text-[#ECEED0] mt-2">
            {stats?.totalMessagesProcessed ? stats.totalMessagesProcessed.toLocaleString() : (stats?.totalMessages ? stats.totalMessages.toLocaleString() : '0')}
          </div>
          <div className="text-[10px] text-[#10B981] mt-1 font-mono">100% integridade do histórico</div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">Grupos Moderados</div>
          <div className="text-xl font-mono font-semibold text-[#ECEED0] mt-2">
            {stats?.totalGroupsConfigured ?? (stats?.totalGroups ?? 0)}
          </div>
          <div className="text-[10px] text-[#9DA4B0] mt-1 font-mono">Anti-spam e anti-link ativos</div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono text-[#626B79] uppercase tracking-wider">Erros de Pipeline</div>
          <div className="text-xl font-mono font-semibold text-[#ECEED0] mt-2">
            {stats?.totalErrorsCount ?? (stats?.errorLogsCount ?? 0)}
          </div>
          <div className="text-[10px] text-[#626B79] mt-1 font-mono">Últimas 24 horas</div>
        </div>
      </div>

      {/* Tabela de Instâncias Sob Gestão */}
      <div className="panel">
        <div className="panel-header">
          <span className="text-xs font-semibold text-[#ECEED0]">Barramento de Bots</span>
          <span className="text-[11px] font-mono text-[#626B79]">{bots.length} REGISTOS</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1E2228] bg-[#090A0C] text-[#626B79] font-mono text-[11px] uppercase">
                <th className="py-2.5 px-4 font-normal">Identificação do Bot</th>
                <th className="py-2.5 px-4 font-normal">Proprietário / Linha</th>
                <th className="py-2.5 px-4 font-normal">Estado do Motor</th>
                <th className="py-2.5 px-4 font-normal">Canais Ativos</th>
                <th className="py-2.5 px-4 font-normal text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2228] font-mono text-[#9DA4B0]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#626B79]">Carregando dados das instâncias...</td>
                </tr>
              ) : bots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#626B79]">Nenhuma instância configurada no sistema.</td>
                </tr>
              ) : (
                bots.map((bot) => (
                  <tr key={bot.id} className="hover:bg-[#16191E] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-sans font-medium text-[#ECEED0] text-xs">{bot.name}</div>
                      <div className="text-[10px] text-[#626B79] font-mono mt-0.5">{bot.id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-[#ECEED0]">{bot.ownerName || 'Não definido'}</div>
                      <div className="text-[10px] text-[#626B79]">{bot.ownerPhone || '—'}</div>
                    </td>
                    <td className="py-3 px-4">
                      {bot.active || bot.status === 'Conectado' ? (
                        <span className="badge-status bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                          ATIVO
                        </span>
                      ) : (
                        <span className="badge-status bg-[#6B7280]/10 text-[#9DA4B0] border border-[#6B7280]/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#6B7280]" />
                          INATIVO
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[11px]">
                      <div className="flex gap-1.5">
                        {bot.respondInPrivate && <span className="px-1.5 py-0.5 bg-[#16191E] border border-[#2A2F37] rounded text-[#ECEED0]">PV</span>}
                        {bot.respondInGroups && <span className="px-1.5 py-0.5 bg-[#16191E] border border-[#2A2F37] rounded text-[#ECEED0]">GP</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={() => onSelectBot(bot)} 
                        icon={<ArrowUpRight className="w-3.5 h-3.5"/>}
                      >
                        Gerenciar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
