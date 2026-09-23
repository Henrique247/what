import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, 
  ArrowLeft, 
  RefreshCw, 
  Copy, 
  Check, 
  User, 
  KeyRound, 
  ShieldCheck, 
  LogOut, 
  ChevronDown,
  ChevronRight,
  Search,
  Bell,
  Headphones,
  SlidersHorizontal,
  Bot as BotIcon
} from 'lucide-react';
import { Bot, ActiveTab } from '../../types';
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
  onSelectBotTab?: (tab: ActiveTab) => void;
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
  onSelectBotTab,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedBot?.id) {
      navigator.clipboard.writeText(selectedBot.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleLogout = () => {
    if (selectedBot) {
      localStorage.removeItem(`bot_token_${selectedBot.id}`);
      sessionStorage.removeItem(`bot_auth_${selectedBot.id}`);
      if (!isAdminMode) {
        window.location.href = `/bot/${selectedBot.id}`;
        return;
      }
    }
    localStorage.removeItem('techstar_admin_token');
    window.location.href = '/admin';
  };

  const getBreadcrumbs = () => {
    if (currentView === 'dashboard') {
      return (
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm tracking-tight flex items-center gap-2">
            Dashboard Operacional
          </span>
          <span className="text-xs text-sky-400 font-mono hidden sm:inline">/ Visão Geral</span>
        </div>
      );
    }
    if (currentView === 'bots') {
      return (
        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
          <span>TechStar</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-medium">Instâncias & Agentes</span>
        </div>
      );
    }
    if (currentView === 'manage' && selectedBot) {
      return (
        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
          {isAdminMode && (
            <>
              <button
                onClick={onBackToBots}
                className="hover:text-sky-400 transition-colors hidden sm:inline"
              >
                <span>Instâncias</span>
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline" />
            </>
          )}
          <span className="text-white font-semibold truncate max-w-[120px] sm:max-w-[200px]">
            {selectedBot.name}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            selectedBot.status === 'Conectado'
              ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            {selectedBot.status === 'Conectado' ? '● Online' : '○ Offline'}
          </span>

          <div className="hidden lg:flex items-center gap-1.5 ml-2 pl-2 border-l border-[#1b3157]">
            <span className="text-slate-500 text-xs font-mono">ID: {selectedBot.id}</span>
            <button
              onClick={handleCopyId}
              className="p-1 hover:text-white text-slate-400 transition-colors rounded"
              title="Copiar ID do Bot"
            >
              {copiedId ? <Check className="w-3 h-3 text-sky-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#070e1d]/90 backdrop-blur-md border-b border-[#142340] px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left Area: Mobile hamburger & breadcrumbs */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenMobileSidebar}
          className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#0f1d38] lg:hidden transition-colors"
          aria-label="Abrir Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {currentView === 'manage' && isAdminMode && (
          <button
            onClick={onBackToBots}
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-[#0c1833] border border-[#1b3157] hover:border-sky-500/40 transition-all mr-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar aos Bots</span>
          </button>
        )}

        <div>{getBreadcrumbs()}</div>
      </div>

      {/* Center Area: Quick Search Bar as seen in reference image */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-sky-400/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar agentes, logs, conversas..."
            className="w-full bg-[#0a152d] border border-[#1b3157] focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] rounded-xl pl-10 pr-12 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 bg-[#070e1d] px-1.5 py-0.5 rounded border border-[#16294a]">
            ⌘K
          </span>
        </div>
      </div>

      {/* Right Area: Controls, Status, Notifications, Profile Avatar */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Support / Quick action */}
        <button
          className="hidden sm:flex p-2 rounded-xl text-slate-400 hover:text-sky-300 hover:bg-[#0f1d38] border border-[#16294a] transition-all"
          title="Central de Suporte"
          onClick={() => window.open('https://wa.me/', '_blank')}
        >
          <Headphones className="w-4 h-4" />
        </button>

        {/* Security Shield Status */}
        <div 
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/10 border border-sky-400/25 text-sky-300 text-xs font-mono"
          title="Proteção Ativa"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-[11px] hidden lg:inline">SECURE</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#0f1d38] border border-[#16294a] transition-all disabled:opacity-50"
          title="Atualizar dados"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
        </button>

        {/* Notification Bell with Badge */}
        <button
          className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#0f1d38] border border-[#16294a] transition-all"
          title="Notificações do Sistema"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
        </button>

        {/* Admin Action */}
        {isAdminMode && currentView !== 'manage' && (
          <Button
            size="sm"
            variant="primary"
            onClick={onOpenCreateModal}
            className="hidden sm:inline-flex"
          >
            + Criar Agente
          </Button>
        )}

        {/* Profile Dropdown Menu with Cyber Ring */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0c1833] hover:bg-[#122347] border border-[#1b3157] text-slate-300 hover:text-white transition-all shadow-sm"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-[0_0_10px_rgba(14,165,233,0.3)]">
              {selectedBot?.ownerName ? selectedBot.ownerName.charAt(0).toUpperCase() : 'A'}
            </div>
            <span className="hidden md:inline text-xs font-medium max-w-[110px] truncate text-slate-200">
              {selectedBot?.ownerName || 'Admin'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#091326] border border-[#1b3259] shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2.5 border-b border-[#142340]">
                <p className="text-xs font-semibold text-white truncate">
                  {selectedBot?.ownerName || 'Administrador Master'}
                </p>
                <p className="text-[10px] text-sky-400 font-mono truncate">
                  {selectedBot?.ownerPhone || 'Painel de Controle'}
                </p>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    if (onSelectBotTab) onSelectBotTab('settings');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-sky-500/10 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-sky-400" />
                  <span>Configurações da Conta</span>
                </button>

                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    if (onSelectBotTab) onSelectBotTab('settings');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-sky-500/10 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Segurança & Chaves</span>
                </button>
              </div>

              <div className="border-t border-[#142340] pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>Sair do Painel</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

