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
        className={`fixed top-0 bottom-0 left-0 z-40 w-60 bg-[#090A0C] border-r border-[#1E2228] flex flex-col justify-between shrink-0 h-screen select-none transition-transform duration-200 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Identidade da Plataforma */}
          <div className="h-14 px-4 border-b border-[#1E2228] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-[#059669] rounded-[4px] flex items-center justify-center text-white font-mono font-bold text-xs">
                TS
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-[#ECEED0] tracking-tight leading-none">TECHSTAR</span>
                <span className="text-[10px] font-mono text-[#626B79] leading-none mt-1">Bot Manager v1.0</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-[#10B981]" title="Servidor Online" />
          </div>

          {/* Menus de Navegação */}
          <div className="p-2 space-y-4">
            {/* Global Navigation */}
            {isAdminMode && (
              <div className="space-y-1">
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-xs font-medium transition-colors ${
                    currentView === 'dashboard'
                      ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                      : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-[#626B79]" />
                  <span>Visão Geral</span>
                </button>

                <button
                  onClick={() => handleNavClick('bots')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-[4px] text-xs font-medium transition-colors ${
                    currentView === 'bots'
                      ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                      : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Bot className="w-4 h-4 text-[#626B79]" />
                    <span>Instâncias Bot</span>
                  </div>
                  <span className="text-[10px] font-mono bg-[#1D2128] text-[#9DA4B0] px-1.5 py-0.5 rounded border border-[#2A2F37]">
                    {activeBots}/{totalBots}
                  </span>
                </button>

                <button
                  onClick={() => {
                    onOpenCreateModal();
                    onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-xs font-medium text-[#10B981] hover:bg-[#101216] border border-transparent hover:border-[#10B981]/20 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Instância</span>
                </button>
              </div>
            )}

            {/* Selected Bot Management Navigation */}
            {selectedBot && (
              <div className="space-y-1 pt-2 border-t border-[#1E2228]">
                <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono text-[#626B79] uppercase tracking-wider">
                  <span className="truncate">{selectedBot.name}</span>
                  {selectedBot.active ? (
                    <span className="text-[#10B981]">ONLINE</span>
                  ) : (
                    <span className="text-[#6B7280]">OFFLINE</span>
                  )}
                </div>

                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('whatsapp');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'whatsapp'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>WhatsApp & QR</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('private');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'private'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Privado / Conversas</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('groups');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'groups'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Grupos</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('moderation');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'moderation'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Moderação</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('memory');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'memory'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Memória</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('knowledge');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'knowledge'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Conhecimento</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('automation');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'automation'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Automação</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('motivation');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'motivation'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <SunMedium className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Motivação</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('documents');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'documents'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Documentos / PDF</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('stats');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'stats'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Métricas</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('logs');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'logs'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Auditoria & Logs</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('settings');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'settings'
                        ? 'bg-[#16191E] text-white border border-[#2A2F37]'
                        : 'text-[#9DA4B0] hover:text-white hover:bg-[#101216]'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 text-[#626B79]" />
                    <span>Configurações</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Estado dos Motores de Execução */}
        <div className="p-3 border-t border-[#1E2228] bg-[#101216] shrink-0">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#626B79] mb-1">
            <span>MOTOR IA</span>
            <span className="text-[#10B981]">GEMINI 1.5</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-[#626B79]">
            <span>LIB BAILEYS</span>
            <span className="text-[#9DA4B0]">v7.0.0</span>
          </div>
        </div>
      </aside>
    </>
  );
};
