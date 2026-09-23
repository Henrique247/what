import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { 
  Terminal, 
  Trash2, 
  Pause, 
  Play, 
  Search, 
  Download, 
  Filter
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

const MOCK_INITIAL_LOGS: LogEntry[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 10000).toISOString(),
    level: 'INFO',
    source: 'SYSTEM',
    message: 'Instância inicializada com sucesso. Aguardando eventos de socket.'
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 8000).toISOString(),
    level: 'INFO',
    source: 'BAILEYS',
    message: 'Sessão re-autenticada via credenciais salvas no armazenamento seguro.'
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 5000).toISOString(),
    level: 'DEBUG',
    source: 'BAILEYS',
    message: 'Inbound message: [JID: 244923000000@s.whatsapp.net] - Content: "Olá, quais são os serviços disponíveis?"'
  },
  {
    id: 'log-4',
    timestamp: new Date(Date.now() - 3000).toISOString(),
    level: 'INFO',
    source: 'GEMINI',
    message: 'Prompt contextual processado por gemini-1.5-flash. Tokens: 420 (input), 85 (output).'
  },
  {
    id: 'log-5',
    timestamp: new Date(Date.now() - 1000).toISOString(),
    level: 'INFO',
    source: 'BAILEYS',
    message: 'Outbound message transmitida com sucesso para o destinatário.'
  }
];

export const BotLogsTab: React.FC<BotLogsTabProps> = ({
  botId,
  logs = MOCK_INITIAL_LOGS,
  onClearLogs
}) => {
  const [logList, setLogList] = useState<LogEntry[]>(logs.length > 0 ? logs : MOCK_INITIAL_LOGS);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Sync logs when prop updates
  useEffect(() => {
    if (logs && logs.length > 0) {
      setLogList(logs);
    }
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
    const link = document.createElement('a');
    link.href = url;
    link.download = `bot-${botId}-logs-${Date.now()}.log`;
    link.click();
  };

  const filteredLogs = logList.filter(log => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch = searchQuery === '' || 
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesLevel && matchesSearch;
  });

  const getLevelBadgeClass = (level: LogEntry['level']) => {
    switch (level) {
      case 'INFO':
        return 'text-[#34D399] bg-[#10B981]/10 border-[#10B981]/20';
      case 'WARN':
        return 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20';
      case 'ERROR':
        return 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20';
      case 'DEBUG':
        return 'text-[#9DA4B0] bg-[#626B79]/10 border-[#626B79]/20';
    }
  };

  return (
    <div className="space-y-4 max-w-5xl select-none">
      {/* Barra de Ferramentas da Consola */}
      <div className="panel p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#626B79]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar mensagem ou origem..."
              className="w-full h-8 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] pl-8 pr-3 text-xs font-mono text-[#ECEED0] placeholder-[#626B79] focus:outline-none focus:border-[#3A414D]"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] px-2 h-8">
            <Filter className="w-3.5 h-3.5 text-[#626B79]" />
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="bg-transparent text-xs font-mono text-[#ECEED0] focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#101216]">TODOS</option>
              <option value="INFO" className="bg-[#101216]">INFO</option>
              <option value="WARN" className="bg-[#101216]">WARN</option>
              <option value="ERROR" className="bg-[#101216]">ERROR</option>
              <option value="DEBUG" className="bg-[#101216]">DEBUG</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={autoScroll ? 'secondary' : 'ghost'}
            icon={autoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? 'Pausar Scroll' : 'Auto Scroll'}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportLogs}
          >
            Exportar
          </Button>

          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={handleClear}
          >
            Limpar
          </Button>
        </div>
      </div>

      {/* Janela do Terminal */}
      <div className="panel overflow-hidden border-[#1E2228]">
        <div className="bg-[#101216] px-4 py-2 border-b border-[#1E2228] flex items-center justify-between text-[11px] font-mono text-[#626B79]">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-[#059669]" />
            <span>STDERR/STDOUT — INSTÂNCIA [{botId}]</span>
          </div>
          <span>{filteredLogs.length} EVENTOS</span>
        </div>

        <div
          ref={logContainerRef}
          className="bg-[#090A0C] p-4 h-[420px] overflow-y-auto font-mono text-[11px] leading-relaxed divide-y divide-[#16191E]"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[#626B79]">
              Nenhum registo de evento encontrado para os filtros selecionados.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="py-2 flex items-start gap-3 hover:bg-[#101216]/50 transition-colors">
                <span className="text-[#626B79] shrink-0 select-none text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>

                <span className={`px-1.5 py-0.5 rounded-[2px] text-[9px] border font-bold shrink-0 ${getLevelBadgeClass(log.level)}`}>
                  {log.level}
                </span>

                <span className="text-[#9DA4B0] bg-[#16191E] px-1.5 py-0.5 rounded-[2px] border border-[#2A2F37] text-[10px] shrink-0 select-none">
                  {log.source}
                </span>

                <div className="text-[#ECEED0] break-all flex-1">
                  {log.message}
                  {log.details && (
                    <pre className="mt-1 p-2 bg-[#101216] border border-[#1E2228] rounded-[2px] text-[10px] text-[#9DA4B0] overflow-x-auto">
                      {log.details}
                    </pre>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-[#101216] px-4 py-1.5 border-t border-[#1E2228] flex items-center justify-between text-[10px] font-mono text-[#626B79]">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${autoScroll ? 'bg-[#10B981] animate-pulse' : 'bg-[#6B7280]'}`} />
            {autoScroll ? 'STREAM EM TEMPO REAL ATIVO' : 'STREAM EM PAUSA'}
          </span>
          <span>BAILEYS SOCKET PIPE</span>
        </div>
      </div>
    </div>
  );
};
