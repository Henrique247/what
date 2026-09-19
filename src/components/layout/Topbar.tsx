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
    }
    localStorage.removeItem('techstar_admin_token');
    window.location.reload();
  };

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
        <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400">
          {isAdminMode && (
            <>
              <button
                onClick={onBackToBots}
                className="hover:text-emerald-400 transition-colors hidden sm:inline"
              >
                <span>Meus Bots</span>
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:inline" />
            </>
          )}
          <span className="text-zinc-100 font-semibold truncate max-w-[120px] sm:max-w-[200px]">
            {selectedBot.name}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            selectedBot.status === 'Conectado'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}>
            {selectedBot.status === 'Conectado' ? '● Online' : '○ Offline'}
          </span>

          <div className="hidden lg:flex items-center gap-1.5 ml-2 pl-2 border-l border-[#22282F]">
            <span className="text-zinc-500 text-xs font-mono">ID: {selectedBot.id}</span>
            <button
              onClick={handleCopyId}
              className="p-1 hover:text-white text-zinc-400 transition-colors rounded"
              title="Copiar ID do Bot"
            >
              {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
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

        {currentView === 'manage' && isAdminMode && (
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

      {/* Right Area: Status, Refresh, Profile Dropdown */}
      <div className="flex items-center gap-2.5">
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

        {/* Profile Dropdown Menu */}
        {selectedBot && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-xl bg-[#101418] hover:bg-[#151A1F] border border-[#22282F] text-zinc-300 hover:text-white transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-bold">
                <User className="w-3.5 h-3.5" />
              </div>
              <span className="hidden md:inline text-xs font-medium max-w-[110px] truncate">
                {selectedBot.ownerName || 'Proprietário'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#101418] border border-[#22282F] shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2 border-b border-[#22282F]">
                  <p className="text-xs font-semibold text-zinc-200 truncate">
                    {selectedBot.ownerName || 'Proprietário do Bot'}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono truncate">
                    {selectedBot.ownerPhone || `ID: ${selectedBot.id}`}
                  </p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      if (onSelectBotTab) onSelectBotTab('settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-[#151A1F] transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Meu Perfil</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      if (onSelectBotTab) onSelectBotTab('settings');
                      setTimeout(() => {
                        const el = document.getElementById('settings-security');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-[#151A1F] transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Segurança</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      if (onSelectBotTab) onSelectBotTab('settings');
                      setTimeout(() => {
                        const el = document.getElementById('settings-security');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-[#151A1F] transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Alterar PIN</span>
                  </button>
                </div>

                <div className="border-t border-[#22282F] pt-1">
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
        )}
      </div>
    </header>
  );
};

