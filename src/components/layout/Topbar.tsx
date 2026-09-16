import React from 'react';
import { Menu, ArrowLeft, RefreshCw, Shield, Bot as BotIcon, CheckCircle2, ChevronRight } from 'lucide-react';
import { Bot } from '../../types';
import { Button } from '../ui/Button';

interface TopbarProps {
  currentView: 'dashboard' | 'bots' | 'manage';
  selectedBot: Bot | null;
  onBackToBots: () => void;
  onOpenMobileSidebar: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onOpenCreateModal: () => void;
  isAdminMode: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentView,
  selectedBot,
  onBackToBots,
  onOpenMobileSidebar,
  onRefresh,
  isRefreshing = false,
  onOpenCreateModal,
  isAdminMode,
}) => {
  const getBreadcrumbs = () => {
    if (currentView === 'dashboard') {
      return (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="text-zinc-200 font-medium">Dashboard</span>
        </div>
      );
    }
    if (currentView === 'bots') {
      return (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>TechStar</span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          <span className="text-zinc-200 font-medium">Meus Bots</span>
        </div>
      );
    }
    if (currentView === 'manage' && selectedBot) {
      return (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <button
            onClick={onBackToBots}
            className="hover:text-emerald-400 transition-colors flex items-center gap-1"
          >
            <span>Meus Bots</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          <span className="text-zinc-200 font-medium truncate max-w-[150px] sm:max-w-none">
            {selectedBot.name}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            selectedBot.status === 'Conectado'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}>
            {selectedBot.status === 'Conectado' ? '● Online' : '○ Offline'}
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#080A0C]/90 backdrop-blur-md border-b border-[#22282F] px-4 sm:px-6 flex items-center justify-between">
      {/* Left Area: Mobile hamburger & breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="p-2 -ml-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F] lg:hidden transition-colors"
          aria-label="Abrir Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {currentView === 'manage' && (
          <button
            onClick={onBackToBots}
            className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-[#101418] border border-[#22282F] hover:border-zinc-700 transition-colors mr-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar aos Bots</span>
          </button>
        )}

        <div>{getBreadcrumbs()}</div>
      </div>

      {/* Right Area: Status, Refresh, Actions */}
      <div className="flex items-center gap-3">
        {/* System Status Indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-[#101418] border border-[#22282F] text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-300 font-medium">Plataforma Operacional</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[#151A1F] border border-[#22282F] transition-all disabled:opacity-50"
          title="Atualizar dados"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* Admin Action */}
        {isAdminMode && currentView !== 'manage' && (
          <Button
            size="sm"
            variant="primary"
            onClick={onOpenCreateModal}
            className="hidden sm:inline-flex"
          >
            + Criar Bot
          </Button>
        )}
      </div>
    </header>
  );
};
