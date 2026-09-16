import React, { useState, useEffect, useCallback } from 'react';
import { Bot, ActiveTab, AdminStats } from './types';
import { api } from './services/api';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { DashboardPage } from './pages/DashboardPage';
import { BotsListPage } from './pages/BotsListPage';
import { BotManagePage } from './pages/BotManagePage';
import { CreateBotWizard } from './components/CreateBotWizard';
import { ToastProvider, useToast } from './components/ui/Toast';

const AppContent: React.FC = () => {
  const toast = useToast();

  // Navigation & View State
  const [currentView, setCurrentView] = useState<'dashboard' | 'bots' | 'manage'>('dashboard');
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [activeBotTab, setActiveBotTab] = useState<ActiveTab>('overview');

  // Application Data State
  const [bots, setBots] = useState<Bot[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Security & Mode State
  const [isAdminMode, setIsAdminMode] = useState(true);
  const [clientToken, setClientToken] = useState<string | undefined>(undefined);

  // Modals & Mobile Drawer State
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Load Data
  const loadData = useCallback(async (showToast: boolean = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      const [fetchedBots, fetchedStats] = await Promise.all([
        api.getBots().catch(() => []),
        api.getAdminStats().catch(() => null),
      ]);

      setBots(fetchedBots);
      setAdminStats(fetchedStats);

      // If a bot is currently selected, update its reference
      if (selectedBot) {
        const updated = fetchedBots.find((b) => b.id === selectedBot.id);
        if (updated) setSelectedBot(updated);
      }

      if (showToast) toast.success('Dados atualizados com sucesso!');
    } catch (e: any) {
      console.error('Erro ao carregar dados:', e);
      if (showToast) toast.error('Erro ao sincronizar dados com o servidor.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedBot, toast]);

  // Initial Boot & URL Route Parsing
  useEffect(() => {
    const handleUrlRoute = async () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const tokenParam = searchParams.get('token');

      if (tokenParam) {
        setClientToken(tokenParam);
      }

      // Check if URL is /manage/:id
      const manageMatch = path.match(/^\/manage\/([^/]+)/);
      if (manageMatch && manageMatch[1]) {
        const botId = manageMatch[1];
        try {
          // If accessing via /manage/:id with client token, might be client mode
          if (tokenParam && !isAdminMode) {
            setIsAdminMode(false);
          }
          const botConfig = await api.getBotConfig(botId, tokenParam || undefined, isAdminMode);
          setSelectedBot(botConfig);
          setCurrentView('manage');
        } catch (e: any) {
          console.error('Erro ao carregar bot da URL:', e);
          toast.error(e.message || 'Erro ao carregar bot solicitado.');
          setCurrentView('bots');
        }
      }
    };

    loadData();
    handleUrlRoute();

    // Browser back/forward button support
    const handlePopState = () => {
      handleUrlRoute();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync window URL when navigating
  const navigateTo = (view: 'dashboard' | 'bots' | 'manage', bot?: Bot) => {
    setCurrentView(view);
    if (view === 'manage' && bot) {
      setSelectedBot(bot);
      const tokenPart = bot.accessToken ? `?token=${bot.accessToken}` : (clientToken ? `?token=${clientToken}` : '');
      window.history.pushState({}, '', `/manage/${bot.id}${tokenPart}`);
    } else if (view === 'bots') {
      window.history.pushState({}, '', '/');
    } else if (view === 'dashboard') {
      window.history.pushState({}, '', '/');
    }
  };

  // Bot Actions
  const handleToggleBot = async (botId: string) => {
    try {
      await api.toggleBot(botId);
      toast.success('Estado do bot atualizado!');
      await loadData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao alternar estado do bot');
    }
  };

  const handleDeleteBot = async (botId: string) => {
    try {
      await api.deleteBot(botId);
      toast.success('Bot excluído com sucesso!');
      if (selectedBot?.id === botId) {
        setSelectedBot(null);
        navigateTo('bots');
      }
      await loadData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao excluir bot');
    }
  };

  const handleRegenerateToken = async (botId: string) => {
    try {
      const res = await api.regenerateToken(botId);
      toast.success('Novo token de acesso gerado!');
      await loadData();
      return res.accessToken;
    } catch (e: any) {
      toast.error(e.message || 'Falha ao regenerar token');
    }
  };

  const handleBotCreated = async (newBotId: string) => {
    await loadData();
    try {
      const freshBot = await api.getBotConfig(newBotId, undefined, true);
      setSelectedBot(freshBot);
      navigateTo('manage', freshBot);
      setActiveBotTab('whatsapp');
    } catch {
      navigateTo('bots');
    }
  };

  return (
    <div className="min-h-screen bg-[#080A0C] text-[#F3F4F6] flex">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onNavigate={navigateTo}
        selectedBot={selectedBot}
        activeBotTab={activeBotTab}
        onSelectBotTab={setActiveBotTab}
        onOpenCreateModal={() => setCreateWizardOpen(true)}
        isAdminMode={isAdminMode}
        onToggleAdminMode={() => {
          const next = !isAdminMode;
          setIsAdminMode(next);
          toast.info(next ? 'Modo TECHSTAR ADMIN ativado' : 'Modo CLIENTE (Restrito) ativado');
        }}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Topbar Header */}
        <Topbar
          currentView={currentView}
          selectedBot={selectedBot}
          onBackToBots={() => navigateTo('bots')}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onRefresh={() => loadData(true)}
          isRefreshing={isRefreshing}
          onOpenCreateModal={() => setCreateWizardOpen(true)}
          isAdminMode={isAdminMode}
        />

        {/* Scrollable View Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {currentView === 'dashboard' && (
            <DashboardPage
              stats={adminStats}
              bots={bots}
              loading={loading}
              onSelectBot={(bot) => navigateTo('manage', bot)}
              onNavigateToBots={() => navigateTo('bots')}
              onOpenCreateModal={() => setCreateWizardOpen(true)}
              isAdminMode={isAdminMode}
            />
          )}

          {currentView === 'bots' && (
            <BotsListPage
              bots={bots}
              loading={loading}
              onSelectBot={(bot) => navigateTo('manage', bot)}
              onToggleBot={handleToggleBot}
              onDeleteBot={handleDeleteBot}
              onRegenerateToken={handleRegenerateToken}
              onOpenCreateModal={() => setCreateWizardOpen(true)}
              isAdminMode={isAdminMode}
            />
          )}

          {currentView === 'manage' && selectedBot && (
            <BotManagePage
              bot={selectedBot}
              activeTab={activeBotTab}
              onSelectTab={setActiveBotTab}
              onUpdateBot={(updated) => setSelectedBot(updated)}
              isAdminMode={isAdminMode}
              clientToken={clientToken}
            />
          )}
        </main>
      </div>

      {/* Create Bot Wizard Modal */}
      <CreateBotWizard
        isOpen={createWizardOpen}
        onClose={() => setCreateWizardOpen(false)}
        onBotCreated={handleBotCreated}
      />
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
