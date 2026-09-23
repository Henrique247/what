import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { 
  Terminal, 
  Trash2, 
  Pause, 
  Play, 
  Search, 
  Download, 
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info
} from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: 'BAILEYS' | 'GEMINI' | 'SYSTEM' | 'WEBHOOK';
  message: string;
  details?: string;
}

interface BotLogsTabProps {
  botId: string;
  logs?: LogEntry[];
  onClearLogs?: () => void;
}

export const BotLogsTab: React.FC<BotLogsTabProps> = ({
  botId,
  logs = [],
  onClearLogs
}) => {
  const [logList, setLogList] = useState<LogEntry[]>(logs);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Sync logs when prop updates
  useEffect(() => {
    setLogList(logs || []);
  }, [logs]);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logList, autoScroll]);

  const handleClear = () => {
    setLogList([]);
    if (onClearLogs) onClearLogs();
  };

  const handleExportLogs = () => {
    const content = logList
      .map(l => `[${l.timestamp}] [${l.level}] [${l.source}]: ${l.message}${l.details ? `\nDetails: ${l.details}` : ''}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot_${botId}_logs_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logList.filter(l => {
    if (filterLevel !== 'ALL' && l.level !== filterLevel) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        l.message.toLowerCase().includes(q) ||
        l.source.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4 select-none">
      {/* Barra de Ferramentas da Consola */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#0b1426]/90 border border-[#162a4d] shadow-lg">
        {/* Filtros de Severidade */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-3 py-1 rounded-xl text-xs font-mono font-medium transition-all ${
                filterLevel === lvl
                  ? 'bg-sky-500 text-white font-bold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                  : 'text-slate-400 hover:text-white hover:bg-[#0c1833]'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Busca e Ações */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-sky-400/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nos eventos..."
              className="bg-[#081021] border border-[#1b3259] rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] w-48 sm:w-60 transition-all"
            />
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-2 rounded-xl border transition-all ${
              autoScroll
                ? 'bg-sky-500/15 border-sky-400/30 text-sky-300'
                : 'bg-[#081021] border-[#1b3259] text-slate-500 hover:text-white'
            }`}
            title={autoScroll ? 'Pausar auto-scroll' : 'Ativar auto-scroll'}
          >
            {autoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportLogs}
            title="Exportar logs"
          >
            Exportar
          </Button>

          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={handleClear}
            title="Limpar consola"
          >
            Limpar
          </Button>
        </div>
      </div>

      {/* Janela de Terminal Cyber */}
      <div 
        ref={logContainerRef}
        className="h-[460px] bg-[#050913] border border-[#162a4d] rounded-2xl p-4 font-mono text-xs overflow-y-auto space-y-2 shadow-inner"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Terminal className="w-8 h-8 text-sky-400/30" />
            <p className="text-xs">Nenhum evento registrado com os filtros atuais.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const levelStyles = {
              INFO: 'text-sky-300 border-sky-400/20 bg-sky-500/10',
              WARN: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
              ERROR: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
              DEBUG: 'text-slate-400 border-slate-700 bg-slate-800/30',
            }[log.level];

            return (
              <div 
                key={log.id} 
                className="p-2.5 rounded-xl bg-[#081021]/80 border border-[#142340] hover:border-sky-500/30 transition-colors flex items-start gap-3"
              >
                <span className="text-[10px] text-slate-500 shrink-0 mt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                
                <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 font-bold ${levelStyles}`}>
                  {log.level}
                </span>

                <span className="text-[10px] text-sky-400/80 bg-sky-500/5 px-2 py-0.5 rounded border border-sky-900/30 shrink-0">
                  {log.source}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="text-slate-200 break-all leading-relaxed">{log.message}</div>
                  {log.details && (
                    <div className="text-[11px] text-slate-400 mt-1 pl-2 border-l border-[#1b3259]">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
