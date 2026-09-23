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
        return <Badge variant="cyan" dot={true}>CONNECTED (Online)</Badge>;
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

  const handleResetSession = async () => {
    try {
      setLoadingAction(true);
      await api.resetWhatsAppSession(bot.id, clientToken, isAdminMode);
      toast.success('Sessão redefinida! Um novo QR Code foi gerado.');
      setIsResetSessionOpen(false);
      onUpdateBot({ ...bot, status: 'Conectando...', qr: null });
      if (onNavigateToTab) {
        onNavigateToTab('whatsapp');
      }
    } catch (e: any) {
      toast.error(e.message || 'Falha ao redefinir sessão');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div id="settings-whatsapp" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Conexão WhatsApp (Baileys)
            </h2>
            <p className="text-xs text-slate-400">Estado da sessão de socket e emparelhamento multi-device</p>
          </div>
        </div>

        {getConnectionBadge()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Número Vinculado</span>
          <p className="font-mono text-white mt-1 font-medium">
            {bot.ownerPhone || 'Não configurado'}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Estado do Socket</span>
          <p className="font-mono text-sky-300 mt-1 font-medium">
            {isConnected ? 'Sessão Ativa & Autenticada' : 'Aguardando Pareamento'}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Protocolo</span>
          <p className="font-mono text-white mt-1 font-medium">
            WebSocket TLS Multi-Device
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToTab && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigateToTab('whatsapp')}
              icon={<QrCode className="w-3.5 h-3.5" />}
            >
              Ver QR Code / Código de Pareamento
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsResetSessionOpen(true)}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Redefinir Sessão Baileys
          </Button>
        </div>

        {isConnected && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsDisconnectOpen(true)}
            icon={<PowerOff className="w-3.5 h-3.5" />}
          >
            Encerrar Conexão WhatsApp
          </Button>
        )}
      </div>

      {/* Confirm Disconnect Dialog */}
      <ConfirmDialog
        isOpen={isDisconnectOpen}
        title="Desconectar Sessão WhatsApp"
        message="Deseja realmente desconectar o bot do WhatsApp? O bot deixará de receber e responder mensagens até que um novo QR Code seja lido."
        confirmText="Sim, Desconectar"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleDisconnect}
        onCancel={() => setIsDisconnectOpen(false)}
        loading={loadingAction}
      />

      {/* Confirm Reset Session Dialog */}
      <ConfirmDialog
        isOpen={isResetSessionOpen}
        title="Redefinir Sessão de WhatsApp"
        message="A redefinição limpará as chaves de autenticação salvas no servidor e gerará um novo QR Code limpo. Use caso ocorram problemas de sincronização."
        confirmText="Redefinir Sessão"
        cancelText="Voltar"
        variant="danger"
        onConfirm={handleResetSession}
        onCancel={() => setIsResetSessionOpen(false)}
        loading={loadingAction}
      />
    </div>
  );
};
