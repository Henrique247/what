import React, { useState } from 'react';
import { AlertTriangle, PowerOff, RotateCcw, Trash2 } from 'lucide-react';
import { Bot } from '../../types';
import { Button } from '../ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { api } from '../../services/api';
import { useToast } from '../ui/Toast';

interface DangerZoneCardProps {
  bot: Bot;
  clientToken?: string;
  isAdminMode?: boolean;
  onUpdateBot: (updated: Bot) => void;
  onBotDeleted?: () => void;
}

export const DangerZoneCard: React.FC<DangerZoneCardProps> = ({
  bot,
  clientToken,
  isAdminMode = false,
  onUpdateBot,
  onBotDeleted,
}) => {
  const toast = useToast();

  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const handleDisconnect = async () => {
    try {
      setLoadingAction(true);
      await api.disconnectWhatsApp(bot.id, clientToken, isAdminMode);
      toast.success('WhatsApp desconectado com sucesso.');
      setDisconnectModalOpen(false);
      onUpdateBot({ ...bot, status: 'Desconectado', qr: null });
    } catch (e: any) {
      toast.error(e.message || 'Falha ao desconectar o bot');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleResetConfig = async () => {
    try {
      setLoadingAction(true);
      await api.resetBotConfig(bot.id, clientToken, isAdminMode);
      toast.success('Configurações do bot restauradas para os padrões com sucesso!');
      setResetModalOpen(false);
      const fresh = await api.getBotConfig(bot.id, clientToken, isAdminMode);
      onUpdateBot(fresh);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao restaurar configurações padrão');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDeleteBot = async () => {
    try {
      setLoadingAction(true);
      await api.deleteBotInstance(bot.id, clientToken, isAdminMode);
      toast.success('Bot excluído permanentemente.');
      setDeleteModalOpen(false);
      if (onBotDeleted) {
        onBotDeleted();
      } else {
        window.location.href = '/admin';
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir o bot');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <>
      <div id="settings-danger" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-rose-500/30 p-5 sm:p-6 space-y-5 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
        <div className="flex items-center justify-between pb-3 border-b border-rose-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-rose-200 uppercase tracking-wider">
                Zona de Perigo (Danger Zone)
              </h2>
              <p className="text-xs text-rose-300/70">Ações críticas com impacto irreversível ou interrupção de serviço</p>
            </div>
          </div>

          <span className="text-[10px] text-rose-400 uppercase font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 font-mono">
            Atenção Redobrada
          </span>
        </div>

        <div className="space-y-3">
          {/* Action 1: Desconectar WhatsApp */}
          <div className="p-4 rounded-xl bg-[#081021] border border-[#162a4d] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Desconectar Sessão do WhatsApp</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Encerra a conexão WebSocket com o WhatsApp. O bot deixará de receber e responder mensagens.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<PowerOff className="w-3.5 h-3.5 text-amber-400" />}
              onClick={() => setDisconnectModalOpen(true)}
              disabled={bot.status === 'Desconectado'}
              className="shrink-0"
            >
              Desconectar
            </Button>
          </div>

          {/* Action 2: Restaurar configurações padrão */}
          <div className="p-4 rounded-xl bg-[#081021] border border-[#162a4d] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Restaurar Configurações Padrão</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Restaura os prompts, mensagens de boas-vindas e regras de moderação para os valores de fábrica.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="w-3.5 h-3.5 text-slate-300" />}
              onClick={() => setResetModalOpen(true)}
              className="shrink-0"
            >
              Restaurar Padrões
            </Button>
          </div>

          {/* Action 3: Excluir Bot (Superadmin ou autorizado) */}
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_12px_rgba(244,63,94,0.1)]">
            <div>
              <p className="text-xs font-semibold text-rose-300">Excluir Esta Instância do Bot</p>
              <p className="text-[11px] text-rose-200/70 mt-0.5">
                Remove permanentemente a instância, credenciais criptográficas e todos os dados associados.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setDeleteModalOpen(true)}
              className="shrink-0"
            >
              Excluir Bot
            </Button>
          </div>
        </div>
      </div>

      {/* Disconnect Modal */}
      <ConfirmDialog
        isOpen={disconnectModalOpen}
        onClose={() => setDisconnectModalOpen(false)}
        onConfirm={handleDisconnect}
        title="Desconectar WhatsApp"
        description="Tem a certeza de que deseja desconectar o WhatsApp desta instância? Será necessário reconectar para voltar a atender."
        confirmText="Sim, Desconectar"
        cancelText="Voltar"
        variant="warning"
        loading={loadingAction}
      />

      {/* Reset Config Modal */}
      <ConfirmDialog
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleResetConfig}
        title="Restaurar Configurações Padrão"
        description="Esta ação redefinirá os prompts e comportamentos deste bot para a configuração original. Esta ação não pode ser desfeita."
        confirmText="Restaurar Padrões"
        cancelText="Cancelar"
        variant="warning"
        loading={loadingAction}
      />

      {/* Delete Bot Modal */}
      <ConfirmDialog
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteBot}
        title="Excluir Bot Permanentemente"
        description={`Tem certeza absoluta de que deseja excluir o bot "${bot.name}" (ID: ${bot.id})? Todos os dados, chaves de autenticação e histórico serão deletados sem possibilidade de recuperação.`}
        confirmText="Sim, Excluir Definitivamente"
        cancelText="Cancelar"
        variant="danger"
        loading={loadingAction}
      />
    </>
  );
};
