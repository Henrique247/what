import React, { useState, useEffect, useCallback } from 'react';
import { Bot, ActiveTab, AdminStats } from './types';
import { api } from './services/api';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { DashboardPage } from './pages/DashboardPage';
import { BotsListPage } from './pages/BotsListPage';
import { BotManagePage } from './pages/BotManagePage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { BotLoginPage } from './pages/BotLoginPage';
import { BotForgotPinModal } from './pages/BotForgotPinModal';
import { CreateBotWizard } from './components/CreateBotWizard';
import { ToastProvider, useToast } from './components/ui/Toast';

const AppContent: React.FC = () => {
  const toast = useToast();

  // Navigation & View State
  const [currentView, setCurrentView] = useState<'dashboard' | 'bots' | 'manage' | 'admin-login' | 'bot-login'>('dashboard');
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
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
  const [forgotPinModalOpen, setForgotPinModalOpen] = useState(false);
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Check Auth State
  const adminToken = localStorage.getItem('techstar_admin_token');

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

      // Check if URL is /admin
      if (path.startsWith('/admin')) {
        if (!localStorage.getItem('techstar_admin_token')) {
          setCurrentView('admin-login');
          setLoading(false);
          return;
        }
        setIsAdminMode(true);
        setCurrentView('dashboard');
        loadData();
        return;
      }

      // Check if URL is /bot/:id (CLIENT PORTAL - ALWAYS ENFORCE PIN)
      const clientBotMatch = path.match(/^\/bot\/([^/?#]+)/);
      if (clientBotMatch && clientBotMatch[1]) {
        const botId = clientBotMatch[1];
        setSelectedBotId(botId);
        setIsAdminMode(false);

        const sessionToken = sessionStorage.getItem(`bot_auth_${botId}`);
        if (!sessionToken) {
          // No active PIN session in this tab: prompt for PIN
          setCurrentView('bot-login');
          setLoading(false);
          return;
        }

        try {
          const botConfig = await api.getBotConfig(botId, sessionToken, false);
          setSelectedBot(botConfig);
          setClientToken(sessionToken);
          setIsAdminMode(false);
          setCurrentView('manage');
        } catch (e: any) {
          console.error('Sessão inválida ou PIN necessário:', e);
          sessionStorage.removeItem(`bot_auth_${botId}`);
          setCurrentView('bot-login');
        } finally {
          setLoading(false);
        }
        return;
      }

      // Check if URL is /manage/:id (ADMIN DIRECT ACCESS)
      const manageMatch = path.match(/^\/manage\/([^/?#]+)/);
      if (manageMatch && manageMatch[1]) {
        const botId = manageMatch[1];
        setSelectedBotId(botId);

        const hasAdminAuth = !!localStorage.getItem('techstar_admin_token');
        if (hasAdminAuth) {
          try {
            const botConfig = await api.getBotConfig(botId, undefined, true);
            setSelectedBot(botConfig);
            setIsAdminMode(true);
            setCurrentView('manage');
          } catch (e: any) {
            console.error('Erro ao carregar bot como admin:', e);
            toast.error(e.message || 'Erro ao carregar bot solicitado.');
            setCurrentView('admin-login');
          } finally {
            setLoading(false);
          }
          return;
        }

        // If not logged as admin, redirect to client portal to request PIN
        window.history.replaceState({}, '', `/bot/${botId}`);
        const sessionToken = sessionStorage.getItem(`bot_auth_${botId}`);
        if (sessionToken) {
          try {
            const botConfig = await api.getBotConfig(botId, sessionToken, false);
            setSelectedBot(botConfig);
            setClientToken(sessionToken);
            setIsAdminMode(false);
            setCurrentView('manage');
          } catch {
            sessionStorage.removeItem(`bot_auth_${botId}`);
            setCurrentView('bot-login');
          } finally {
            setLoading(false);
          }
        } else {
          setCurrentView('bot-login');
          setIsAdminMode(false);
          setLoading(false);
        }
        return;
      }

      // Root /
      if (path === '/' || path === '') {
        if (!localStorage.getItem('techstar_admin_token')) {
          // If no admin token, redirect or prompt admin login
          window.history.replaceState({}, '', '/admin');
          setCurrentView('admin-login');
          setLoading(false);
          return;
        }
        loadData();
        setCurrentView('dashboard');
      }
    };

    handleUrlRoute();

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
      window.history.pushState({}, '', `/manage/${bot.id}`);
    } else if (view === 'bots') {
      window.history.pushState({}, '', '/admin');
    } else if (view === 'dashboard') {
      window.history.pushState({}, '', '/admin');
    }
  };

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

  // Render Admin Login if needed
  if (currentView === 'admin-login') {
    return (
      <AdminLoginPage
        onLoginSuccess={() => {
          window.history.pushState({}, '', '/admin');
          setCurrentView('dashboard');
          loadData();
        }}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/admin');
          setCurrentView('admin-login');
        }}
      />
    );
  }

  // Render Bot Login if needed
  if (currentView === 'bot-login' && selectedBotId) {
    return (
      <>
        <BotLoginPage
          botId={selectedBotId}
          onLoginSuccess={async (token) => {
            sessionStorage.setItem(`bot_auth_${selectedBotId}`, token);
            setClientToken(token);
            setIsAdminMode(false);
            try {
              const botConfig = await api.getBotConfig(selectedBotId, token, false);
              setSelectedBot(botConfig);
              setCurrentView('manage');
              window.history.pushState({}, '', `/bot/${selectedBotId}`);
            } catch (err: any) {
              toast.error(err.message || 'Erro ao carregar bot');
            }
          }}
          onOpenForgotPin={() => setForgotPinModalOpen(true)}
        />
        <BotForgotPinModal
          isOpen={forgotPinModalOpen}
          onClose={() => setForgotPinModalOpen(false)}
          botId={selectedBotId}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#050913] text-slate-100 flex relative overflow-x-hidden selection:bg-sky-500/30 selection:text-white">
      {/* Ambient Cyber Neon Background Glows */}
      <div className="pointer-events-none fixed top-[-10%] right-[-5%] w-[600px] h-[600px] bg-sky-500/10 blur-[140px] rounded-full z-0" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[20%] w-[500px] h-[500px] bg-blue-600/10 blur-[140px] rounded-full z-0" />

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
          localStorage.removeItem('techstar_admin_token');
          window.location.href = '/admin';
        }}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        totalBots={bots.length}
        activeBots={bots.filter(b => b.active === 1 || b.status === 'Conectado').length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 relative z-10">
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
          onSelectBotTab={setActiveBotTab}
        />

        {/* Scrollable View Content with Cyber Container Frame */}
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
              onBack={() => navigateTo('bots')}
              onRestartBot={async (botId) => {
                await api.resetBotSession(botId, clientToken, isAdminMode);
                toast.success('Sessão da instância reiniciada');
                loadData(false);
              }}
              onDisconnectBot={async (botId) => {
                await api.saveBotConfig(botId, { active: 0 }, clientToken, isAdminMode);
                toast.success('Instância desconectada com sucesso');
                loadData(false);
              }}
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
