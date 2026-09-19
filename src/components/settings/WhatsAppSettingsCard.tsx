import React, { useState } from 'react';
import { 
  QrCode, 
  Smartphone, 
  RefreshCw, 
  PowerOff, 
  Zap, 
  Calendar, 
  ShieldCheck, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { Bot, ActiveTab } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { api } from '../../services/api';
import { useToast } from '../ui/Toast';

interface WhatsAppSettingsCardProps {
  bot: Bot;
  clientToken?: string;
  isAdminMode?: boolean;
  onUpdateBot: (updated: Bot) => void;
  onNavigateToTab?: (tab: ActiveTab) => void;
}

export const WhatsAppSettingsCard: React.FC<WhatsAppSettingsCardProps> = ({
  bot,
  clientToken,
  isAdminMode = false,
  onUpdateBot,
  onNavigateToTab,
}) => {
  const toast = useToast();

  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);
  const [isResetSessionOpen, setIsResetSessionOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  // Status mapping
  const isConnected = bot.status === 'Conectado';
  const isConnecting = bot.status === 'Conectando...';

  const getConnectionBadge = () => {
    switch (bot.status) {
      case 'Conectado':
        return <Badge variant="emerald" dot={true}>CONNECTED (Online)</Badge>;
      case 'Conectando...':
        return <Badge variant="amber" dot={true}>CONNECTING (A Conectar)</Badge>;
      case 'Desconectado':
        return <Badge variant="gray">DISCONNECTED (Desconectado)</Badge>;
      default:
        return <Badge variant="gray">{bot.status || 'OFFLINE'}</Badge>;
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoadingAction(true);
      await api.disconnectWhatsApp(bot.id, clientToken, isAdminMode);
      toast.success('WhatsApp desconectado com sucesso.');
      setIsDisconnectOpen(false);
      onUpdateBot({ ...bot, status: 'Desconectado', qr: null });
    } catch (e: any) {
      toast.error(e.message || 'Falha ao desconectar');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReconnect = async () => {
    try {
      setLoadingAction(true);
      await api.reconnectWhatsApp(bot.id, clientToken, isAdminMode);
      toast.success('Tentativa de reconexão iniciada.');
      onUpdateBot({ ...bot, status: 'Conectando...' });
      setTimeout(async () => {
        try {
          const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
          onUpdateBot(fresh);
        } catch {}
      }, 3000);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao reconectar');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleResetSession = async () => {
    try {
      setLoadingAction(true);
      await api.resetBotSession(bot.id, clientToken, isAdminMode);
      toast.success('Sessão redefinida. Um novo QR Code será gerado.');
      setIsResetSessionOpen(false);
      onUpdateBot({ ...bot, status: 'Conectando...', qr: null });
      setTimeout(async () => {
        try {
          const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
          onUpdateBot(fresh);
        } catch {}
      }, 2500);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao reiniciar sessão');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <>
      <div id="settings-whatsapp" className="techstar-card p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                Sistema & Conexão WhatsApp
              </h2>
              <p className="text-xs text-zinc-400">Sessão Baileys, sincronização e status de conexão</p>
            </div>
          </div>

          <div>{getConnectionBadge()}</div>
        </div>

        {/* Informações da Conexão */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Número Conectado */}
          <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F]">
            <span className="text-[10px] text-zinc-500 font-semibold uppercase flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Número Conectado</span>
            </span>
            <p className="text-xs font-mono text-zinc-200 mt-1 font-semibold truncate">
              {bot.connectedPhone || (isConnected ? bot.ownerPhone || 'Sincronizado' : 'Não conectado')}
            </p>
          </div>

          {/* JID / LID Conectado */}
          <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F]">
            <span className="text-[10px] text-zinc-500 font-semibold uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Identificador Criptográfico</span>
            </span>
            <p className="text-xs font-mono text-zinc-300 mt-1 truncate">
              {bot.connectedLid ? `${bot.connectedLid.slice(0, 16)}...` : 'LID / JID Baileys'}
            </p>
          </div>

          {/* Última Conexão */}
          <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F] sm:col-span-2 md:col-span-1">
            <span className="text-[10px] text-zinc-500 font-semibold uppercase flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Última Sincronização</span>
            </span>
            <p className="text-xs text-emerald-400 mt-1 font-medium truncate">
              {bot.lastConnectedAt
                ? new Date(bot.lastConnectedAt).toLocaleString('pt-PT')
                : (isConnected ? 'Ativo recentemente' : 'Pendente')}
            </p>
          </div>
        </div>

        {/* QR Code Preview & Action Box */}
        {bot.qr && !isConnected && (
          <div className="p-4 rounded-xl bg-[#101418] border border-emerald-500/30 flex flex-col sm:flex-row items-center gap-5">
            <div className="p-2 rounded-xl bg-white shrink-0 shadow-md">
              <img src={bot.qr} alt="QR Code WhatsApp" className="w-36 h-36 object-contain" />
            </div>
            <div className="space-y-2 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>QR Code Disponível para Pareamento</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed max-w-md">
                Abra o WhatsApp no telemóvel, toque em <strong>Aparelhos Conectados → Conectar um Aparelho</strong> e aponte a câmara para este código.
              </p>
              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('whatsapp')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium flex items-center gap-1 mx-auto sm:mx-0"
                >
                  <span>Abrir visualização completa do QR Code</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-zinc-500">
            Ações de conexão afetam diretamente o socket ativo do Baileys no container.
          </p>

          <div className="flex items-center gap-2">
            {isConnected ? (
              <Button
                variant="danger"
                size="sm"
                icon={<PowerOff className="w-3.5 h-3.5" />}
                onClick={() => setIsDisconnectOpen(true)}
                disabled={loadingAction}
              >
                Desconectar
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon={<Zap className="w-3.5 h-3.5" />}
                onClick={handleReconnect}
                loading={loadingAction && isConnecting}
              >
                Reconectar
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => setIsResetSessionOpen(true)}
              disabled={loadingAction}
            >
              Reiniciar Sessão & QR
            </Button>
          </div>
        </div>
      </div>

      {/* Disconnect Confirm */}
      <ConfirmDialog
        isOpen={isDisconnectOpen}
        onClose={() => setIsDisconnectOpen(false)}
        onConfirm={handleDisconnect}
        title="Desconectar WhatsApp"
        description="Tem a certeza de que deseja desconectar o WhatsApp desta instância? O bot deixará de receber e responder mensagens até que seja reconectado."
        confirmText="Sim, Desconectar"
        cancelText="Cancelar"
        variant="danger"
        loading={loadingAction}
      />

      {/* Reset Session Confirm */}
      <ConfirmDialog
        isOpen={isResetSessionOpen}
        onClose={() => setIsResetSessionOpen(false)}
        onConfirm={handleResetSession}
        title="Reiniciar Sessão do WhatsApp"
        description="Esta ação encerrará a sessão atual, limpará credenciais locais em cache e forçará a geração de um novo QR Code para pareamento."
        confirmText="Sim, Reiniciar Sessão"
        cancelText="Cancelar"
        variant="warning"
        loading={loadingAction}
      />
    </>
  );
};
