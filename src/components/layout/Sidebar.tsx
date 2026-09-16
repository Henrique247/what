import React from 'react';
import { 
  LayoutDashboard, 
  Bot as BotIcon, 
  PlusCircle, 
  QrCode, 
  BookOpen, 
  Brain, 
  MessageSquare, 
  BarChart3, 
  ShieldAlert, 
  Sliders,
  Cpu, 
  User, 
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Zap
} from 'lucide-react';
import { Bot, ActiveTab } from '../../types';

interface SidebarProps {
  currentView: 'dashboard' | 'bots' | 'manage';
  onNavigate: (view: 'dashboard' | 'bots' | 'manage', bot?: Bot) => void;
  selectedBot: Bot | null;
  activeBotTab: ActiveTab;
  onSelectBotTab: (tab: ActiveTab) => void;
  onOpenCreateModal: () => void;
  isAdminMode: boolean;
  onToggleAdminMode: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  selectedBot,
  activeBotTab,
  onSelectBotTab,
  onOpenCreateModal,
  isAdminMode,
  onToggleAdminMode,
  isOpenMobile,
  onCloseMobile,
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
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#0B0E12] border-r border-[#22282F] flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Logo Section */}
          <div className="h-16 flex items-center px-5 border-b border-[#22282F] gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-950 text-white font-bold tracking-wider text-base">
              <Zap className="w-5 h-5 fill-white text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-wider text-white">TECHSTAR</span>
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  AI
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 tracking-tight font-medium">
                WhatsApp Bot Platform
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="p-3 space-y-6">
            {/* WORKSPACE */}
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                Workspace
              </div>
              <nav className="space-y-1">
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'dashboard'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={() => handleNavClick('bots')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'bots'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                  }`}
                >
                  <BotIcon className="w-4 h-4" />
                  <span>Meus Bots</span>
                </button>

                {isAdminMode && (
                  <button
                    onClick={() => {
                      onOpenCreateModal();
                      onCloseMobile();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Criar Novo Bot</span>
                  </button>
                )}
              </nav>
            </div>

            {/* BOT ATIVO / RECURSOS */}
            {selectedBot && (
              <div>
                <div className="px-3 mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                  <span>Gestão do Bot</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                
                {/* Active Bot Capsule */}
                <div className="mx-2 mb-2.5 p-2.5 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                    {selectedBot.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{selectedBot.name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono truncate">ID: {selectedBot.id}</p>
                  </div>
                </div>

                <nav className="space-y-1">
                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('overview');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'overview'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                    }`}
                  >
                    <Sliders className="w-4 h-4" />
                    <span>Visão Geral & Toggles</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('whatsapp');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'whatsapp'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>WhatsApp & QR Code</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('knowledge');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'knowledge'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Base de Conhecimento</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('memory');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'memory'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                    }`}
                  >
                    <Brain className="w-4 h-4" />
                    <span>Memória de Contexto</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('groups');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'groups'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Controle de Grupos</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('stats');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'stats'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Estatísticas do Bot</span>
                  </button>

                  <button
                    onClick={() => {
                      if (currentView !== 'manage') onNavigate('manage', selectedBot);
                      handleTabClick('logs');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentView === 'manage' && activeBotTab === 'logs'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F]'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Logs de Auditoria</span>
                  </button>
                </nav>
              </div>
            )}

            {/* SISTEMA & SEGURANÇA */}
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                Segurança & Modo
              </div>
              <div className="p-3 rounded-xl bg-[#101418] border border-[#22282F] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300 font-medium">Modo Atual</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    isAdminMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {isAdminMode ? 'MASTER ADMIN' : 'CLIENTE'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-tight">
                  {isAdminMode 
                    ? 'Acesso irrestrito a configurações, criação e exclusão de bots.'
                    : 'Visão segura do cliente: chaves Gemini e credenciais ocultadas.'}
                </p>
                <button
                  onClick={onToggleAdminMode}
                  className="w-full text-xs font-medium py-1.5 px-2.5 rounded-lg bg-[#151A1F] hover:bg-[#1C2229] border border-[#22282F] text-zinc-300 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Alternar para {isAdminMode ? 'Visão Cliente' : 'Visão Admin'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* User Footer Profile */}
        <div className="p-3 border-t border-[#22282F] bg-[#0A0D10]">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-[#101418] border border-[#22282F]">
            <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-200 truncate">
                {isAdminMode ? 'TechStar Master' : (selectedBot?.ownerName || 'Cliente Autenticado')}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className="text-[10px] text-zinc-400 truncate">
                  {isAdminMode ? 'Admin Operacional' : 'Token Ativo'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
