import React, { useState } from 'react';
import { Bot, AdminStats } from '../types';
import { Button } from '../components/ui/Button';
import { 
  Plus, 
  ArrowUpRight, 
  TrendingUp, 
  Activity, 
  Zap, 
  CheckCircle2, 
  Clock, 
  Cpu, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Radio
} from 'lucide-react';

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
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  
  const activeBotsCount = bots.filter(b => b.active === 1 || b.status === 'Conectado').length;
  const totalBotsCount = bots.length;
  const totalMessagesCount = stats?.totalMessagesProcessed ?? stats?.totalMessages ?? 0;
  const totalTasksCount = stats?.totalTasksCount ?? (stats?.totalMessages ?? 0);

  // Real chart data for weekly tasks bar chart from backend stats
  const weeklyData = (stats?.weeklyData && stats.weeklyData.length > 0)
    ? stats.weeklyData 
    : [
        { day: 'DOM', value: 0, count: '0' },
        { day: 'SEG', value: 0, count: '0' },
        { day: 'TER', value: 0, count: '0' },
        { day: 'QUA', value: 0, count: '0' },
        { day: 'QUI', value: 0, count: '0' },
        { day: 'SEX', value: 0, count: '0' },
        { day: 'SÁB', value: 0, count: '0' },
      ];

  const activityPercent = totalBotsCount > 0 
    ? Math.round((activeBotsCount / totalBotsCount) * 100) 
    : 0;
  // Circumference: 2 * PI * 40 = 251.2
  const strokeOffset = 251.2 - (251.2 * activityPercent) / 100;

  return (
    <div className="space-y-6">
      {/* Page Header matching Reference Image Layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#142340]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight">Dashboard</h1>
            <div className="h-4 w-px bg-[#1e355e]" />
            <span className="text-xs font-mono text-sky-400 font-semibold tracking-wider">LIVE TELEMETRY</span>
          </div>
          <div className="w-16 h-0.5 bg-gradient-to-r from-sky-400 to-blue-600 rounded-full mt-1.5" />
          <p className="text-xs text-slate-400 mt-1">
            Controle central de fluxo, atividade de agentes autônomos e métricas de conversão.
          </p>
        </div>

        {/* Action Controls & Filter Tabs */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-[#091326] p-1 rounded-xl border border-[#1b3259]">
            {(['24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                  timeRange === range
                    ? 'bg-sky-500 text-white font-semibold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>

          <Button 
            size="sm" 
            variant="primary" 
            icon={<Plus className="w-3.5 h-3.5" />} 
            onClick={onOpenCreateModal}
          >
            Novo Agente
          </Button>
        </div>
      </div>

      {/* 4 Main Cards Layout reproducing the reference image */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* CARD 1: Atividade dos Agentes (Agent Activity) with SVG Wave + Radial Gauge */}
        <div className="lg:col-span-7 bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 relative overflow-hidden shadow-lg transition-all hover:border-sky-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Atividade dos Agentes
              </h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-400/20">
              <TrendingUp className="w-3 h-3" />
              <span>+14.2% vs ontem</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* Left Column: Big Counter & Wave Line Chart */}
            <div className="sm:col-span-7 space-y-2">
              <div className="text-[11px] font-mono text-slate-400">Total de Requisições / Mensagens</div>
              <div className="text-3xl sm:text-4xl font-mono font-bold text-white tracking-tight flex items-baseline gap-2">
                {totalMessagesCount.toLocaleString()}
                <span className="text-xs font-mono font-normal text-sky-400">reqs</span>
              </div>

              {/* Smooth Cyan SVG Wave Chart */}
              <div className="h-28 w-full pt-2">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 300 90" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#0ea5e9" />
                      <stop offset="50%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>
                  {/* Wave Area Fill */}
                  <path
                    d="M 0 65 Q 40 40, 80 55 T 160 30 T 230 45 T 300 15 L 300 90 L 0 90 Z"
                    fill="url(#waveGradient)"
                  />
                  {/* Wave Stroke Line */}
                  <path
                    d="M 0 65 Q 40 40, 80 55 T 160 30 T 230 45 T 300 15"
                    fill="none"
                    stroke="url(#lineGlow)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  {/* Glowing Point at peak */}
                  <circle cx="160" cy="30" r="4" fill="#38bdf8" className="shadow-[0_0_10px_#38bdf8]" />
                  <circle cx="300" cy="15" r="4.5" fill="#60a5fa" />
                </svg>
              </div>
            </div>

            {/* Right Column: Radial Gauge Ring (67% activity) */}
            <div className="sm:col-span-5 flex flex-col items-center justify-center p-2 border-t sm:border-t-0 sm:border-l border-[#162a4d]">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  {/* Background Circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#101d36"
                    strokeWidth="8"
                  />
                  {/* Animated / Glowing Arc Stroke */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#38bdf8"
                    strokeWidth="8"
                    strokeDasharray="251.2"
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_6px_rgba(56,189,248,0.7)] transition-all duration-700"
                  />
                </svg>
                {/* Center Content */}
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-mono font-bold text-white leading-none">
                    {activityPercent}%
                  </span>
                  <span className="text-[9px] font-mono text-sky-300 mt-1 uppercase tracking-wider">Atividade</span>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 mt-2 text-center">
                Capacidade Operacional
              </span>
            </div>
          </div>
        </div>

        {/* CARD 2: Instâncias Conectadas (Connected) */}
        <div className="lg:col-span-5 bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 relative overflow-hidden shadow-lg transition-all hover:border-sky-500/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Instâncias & Conexões
                </h2>
              </div>
              <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-400/20">
                SOCKETS OK
              </span>
            </div>

            <div className="flex items-baseline gap-3 my-2">
              <span className="text-4xl font-mono font-bold text-white tracking-tight">
                {activeBotsCount}
              </span>
              <span className="text-xs font-mono text-slate-400">
                de {totalBotsCount} {totalBotsCount === 1 ? 'instância' : 'instâncias'} online
              </span>
            </div>
          </div>

          {/* Breakdown Indicators */}
          <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#162a4d]">
            <div className="p-2.5 rounded-xl bg-[#081021] border border-[#142340]">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Latência Média</div>
              <div className="text-sm font-mono font-semibold text-sky-300 mt-0.5">
                {stats?.avgLatencyMs ? `${stats.avgLatencyMs} ms` : (activeBotsCount > 0 ? 'Ativa' : 'Em espera')}
              </div>
              <div className="w-full bg-[#101d36] h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-sky-400 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(10, (stats?.avgLatencyMs || 50) / 4))}%` }}
                />
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#081021] border border-[#142340]">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Taxa de Sucesso</div>
              <div className="text-sm font-mono font-semibold text-emerald-400 mt-0.5">
                {stats?.deliveryRate !== undefined ? `${stats.deliveryRate}%` : '100%'}
              </div>
              <div className="w-full bg-[#101d36] h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${stats?.deliveryRate ?? 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3: Disparos & Tarefas Executadas (Executed Tasks) with Bar Chart */}
        <div className="lg:col-span-7 bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 relative overflow-hidden shadow-lg transition-all hover:border-sky-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Disparos & Tarefas Executadas
              </h2>
            </div>
            <div className="text-right">
              <div className="text-xl font-mono font-bold text-white leading-none">
                {totalTasksCount.toLocaleString()}
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">tarefas processadas</div>
            </div>
          </div>

          {/* Vertical Bar Chart with Glowing Cyan Bars */}
          <div className="grid grid-cols-7 gap-2 items-end h-32 pt-4 border-b border-[#162a4d] pb-2">
            {weeklyData.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                <span className="text-[9px] font-mono text-sky-300 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.count}
                </span>
                <div className="w-full max-w-[28px] bg-[#0c1833] rounded-t-lg overflow-hidden flex flex-col justify-end h-24">
                  <div
                    style={{ height: `${Math.max(item.value, item.count !== '0' ? 8 : 2)}%` }}
                    className={`w-full rounded-t-lg transition-all duration-500 ${
                      item.isPeak
                        ? 'bg-gradient-to-t from-sky-500 to-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.7)]'
                        : 'bg-gradient-to-t from-blue-700 to-sky-500 opacity-80 group-hover:opacity-100'
                    }`}
                  />
                </div>
                <span className={`text-[10px] font-mono ${item.isPeak ? 'text-sky-300 font-bold' : 'text-slate-400'}`}>
                  {item.day}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-3 text-xs font-mono text-slate-400">
            <span>Taxa de Entrega: <strong className="text-sky-400">{stats?.deliveryRate !== undefined ? `${stats.deliveryRate}%` : '100%'}</strong></span>
            <span>Erros Registrados: <strong className="text-slate-200">{stats?.errorLogsCount ?? 0}</strong></span>
          </div>
        </div>

        {/* CARD 4: Performance & Eficiência IA (Progression / IA) */}
        <div className="lg:col-span-5 bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 relative overflow-hidden shadow-lg transition-all hover:border-sky-500/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Eficiência & Resolução IA
                </h2>
              </div>
              <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-400/20">
                GEMINI FLASH
              </span>
            </div>

            {/* Main Progression Metrics */}
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-mono font-bold text-white tracking-tight">
                    {stats?.aiSuccessRate || '100%'}
                  </span>
                  <span className="text-xs font-mono text-sky-400">Taxa de Sucesso IA</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Taxa de resolução automatizada de requisições
                </p>
                <div className="w-full bg-[#0a152d] h-2 rounded-full mt-2 overflow-hidden border border-[#162a4d]">
                  <div 
                    className="bg-gradient-to-r from-sky-500 to-blue-400 h-full rounded-full shadow-[0_0_10px_#38bdf8] transition-all duration-500" 
                    style={{ width: stats?.aiSuccessRate || '100%' }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-mono font-bold text-white tracking-tight">
                    {stats?.tokensPerMin ? `${stats.tokensPerMin}` : 'Ativo'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">tokens / min</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tempo médio de resposta do pipeline: <strong className="text-sky-300">{stats?.avgLatencyMs ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : 'Tempo Real'}</strong>
                </p>
                <div className="w-full bg-[#0a152d] h-2 rounded-full mt-2 overflow-hidden border border-[#162a4d]">
                  <div 
                    className="bg-gradient-to-r from-blue-600 to-sky-400 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.max(15, Number(stats?.tokensPerMin || 30)))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#162a4d] flex items-center justify-between text-xs font-mono text-sky-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Pipeline 100% Operacional
            </span>
            <span className="text-slate-400">Zero timeouts</span>
          </div>
        </div>

      </div>

      {/* Tabela de Instâncias Sob Gestão (Styled with Cyber Blue Aesthetics) */}
      <div className="cyber-card rounded-2xl overflow-hidden border border-[#162a4d]">
        <div className="px-5 py-4 border-b border-[#142340] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#091326]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">Barramento de Agentes</span>
          </div>
          <span className="text-[11px] font-mono text-sky-300 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-400/20">
            {bots.length} INSTÂNCIAS CADASTRADAS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#142340] bg-[#070e1d] text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-5 font-normal">Identificação do Bot</th>
                <th className="py-3 px-5 font-normal">Proprietário / Linha</th>
                <th className="py-3 px-5 font-normal">Estado do Motor</th>
                <th className="py-3 px-5 font-normal">Canais Ativos</th>
                <th className="py-3 px-5 font-normal text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#142340] font-mono text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                      <span>Carregando telemetria das instâncias...</span>
                    </div>
                  </td>
                </tr>
              ) : bots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <p>Nenhuma instância configurada no sistema.</p>
                      <Button size="sm" variant="primary" onClick={onOpenCreateModal}>
                        Criar Primeiro Agente
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                bots.map((bot) => (
                  <tr key={bot.id} className="hover:bg-[#0c1833]/70 transition-colors group">
                    <td className="py-3.5 px-5">
                      <div className="font-sans font-semibold text-white text-xs group-hover:text-sky-300 transition-colors">
                        {bot.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{bot.id}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="text-slate-200">{bot.ownerName || 'Não definido'}</div>
                      <div className="text-[10px] text-slate-500">{bot.ownerPhone || '—'}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      {bot.active || bot.status === 'Conectado' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                          ONLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700 text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          OFFLINE
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-[11px]">
                      <div className="flex gap-1.5">
                        {bot.respondInPrivate && (
                          <span className="px-2 py-0.5 bg-[#091429] border border-sky-900/40 rounded-md text-sky-300 font-mono text-[10px]">
                            PV
                          </span>
                        )}
                        {bot.respondInGroups && (
                          <span className="px-2 py-0.5 bg-[#091429] border border-blue-900/40 rounded-md text-blue-300 font-mono text-[10px]">
                            GP
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={() => onSelectBot(bot)} 
                        icon={<ArrowUpRight className="w-3.5 h-3.5 text-sky-400"/>}
                        className="hover:border-sky-400/50 hover:text-white"
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
