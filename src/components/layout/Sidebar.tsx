import React from 'react';
import { 
  Bot, 
  LayoutDashboard, 
  Radio, 
  MessageSquare, 
  Users, 
  Shield, 
  Database, 
  BookOpen, 
  Cpu, 
  SunMedium, 
  FileText, 
  BarChart3, 
  Terminal, 
  Settings,
  Plus,
  ArrowLeft
} from 'lucide-react';
import { Bot as BotType, ActiveTab } from '../../types';

interface SidebarProps {
  currentView: 'dashboard' | 'bots' | 'manage';
  onNavigate: (view: 'dashboard' | 'bots' | 'manage', bot?: BotType) => void;
  selectedBot: BotType | null;
  activeBotTab: ActiveTab;
  onSelectBotTab: (tab: ActiveTab) => void;
  onOpenCreateModal: () => void;
  isAdminMode: boolean;
  onToggleAdminMode: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  totalBots?: number;
  activeBots?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  selectedBot,
  activeBotTab,
  onSelectBotTab,
  onOpenCreateModal,
  isAdminMode,
  isOpenMobile,
  onCloseMobile,
  totalBots = 0,
  activeBots = 0
}) => {
  const handleNavClick = (view: 'dashboard' | 'bots' | 'manage') => {
    onNavigate(view, selectedBot || undefined);
    onCloseMobile();
  };

  const handleTabClick = (tab: ActiveTab) => {
    onSelectBotTab(tab);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/80 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#070e1d]/95 backdrop-blur-md border-r border-[#142340] flex flex-col justify-between shrink-0 h-screen select-none transition-transform duration-200 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Identidade da Plataforma */}
          <div className="h-16 px-5 border-b border-[#142340] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-mono font-bold text-xs shadow-[0_0_15px_rgba(14,165,233,0.4)]">
                TS
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white tracking-wide leading-none">TECHSTAR IA</span>
                <span className="text-[10px] font-mono text-sky-400/80 leading-none mt-1">Autonomous Suite</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-400/20 text-[10px] font-mono text-sky-300">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              LIVE
            </div>
          </div>

          {/* Menus de Navegação */}
          <div className="p-3 space-y-4">
            {/* Global Navigation */}
            {isAdminMode && (
              <div className="space-y-1">
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    currentView === 'dashboard'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                  }`}
                >
                  <LayoutDashboard className={`w-4 h-4 ${currentView === 'dashboard' ? 'text-white' : 'text-sky-400/70'}`} />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={() => handleNavClick('bots')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    currentView === 'bots'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bot className={`w-4 h-4 ${currentView === 'bots' ? 'text-white' : 'text-sky-400/70'}`} />
                    <span>Instâncias Agentes</span>
                  </div>
                  <span className="text-[10px] font-mono bg-[#0b162c] text-sky-300 px-2 py-0.5 rounded-md border border-[#1b3157]">
                    {activeBots}/{totalBots}
                  </span>
                </button>

                <button
                  onClick={() => {
                    onOpenCreateModal();
                    onCloseMobile();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-sky-400 hover:text-white hover:bg-sky-500/10 border border-dashed border-sky-500/30 hover:border-sky-400 transition-all mt-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Agente</span>
                </button>
              </div>
            )}

            {/* Selected Bot Management Navigation */}
            {selectedBot && (
              <div className="space-y-1 pt-3 border-t border-[#142340]">
                <div className="px-3 py-1 flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  <span className="truncate text-sky-200">{selectedBot.name}</span>
                  {selectedBot.active ? (
                    <span className="text-sky-400 flex items-center gap-1 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                      ONLINE
                    </span>
                  ) : (
                    <span className="text-slate-500">OFFLINE</span>
                  )}
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('whatsapp');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'whatsapp'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>WhatsApp & QR</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('private');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'private'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Privado / Conversas</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('groups');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'groups'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Grupos</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('moderation');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'moderation'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Moderação</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('memory');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'memory'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Memória</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('knowledge');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'knowledge'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Conhecimento</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('automation');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'automation'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Automação</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('motivation');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'motivation'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <SunMedium className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Motivação</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('documents');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'documents'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Documentos / PDF</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('stats');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'stats'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Métricas</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('logs');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'logs'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Auditoria & Logs</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('settings');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      currentView === 'manage' && activeBotTab === 'settings'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#0d1b36]'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 text-sky-400/80" />
                    <span>Configurações</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Estado dos Motores de Execução */}
        <div className="p-3.5 border-t border-[#142340] bg-[#050c18] shrink-0">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 text-sky-400">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              IA ENGINE
            </span>
            <span className="text-white font-semibold">GEMINI 2.5</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>SOCKET PROTO</span>
            <span className="text-slate-300">BAILEYS v7.0</span>
          </div>
        </div>
      </aside>
    </>
  );
};
