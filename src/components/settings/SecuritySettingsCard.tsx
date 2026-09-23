import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, ShieldCheck, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Bot } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { ConfirmDialog } from './ConfirmDialog';

interface SecuritySettingsCardProps {
  bot: Bot;
  clientToken?: string;
  isAdminMode?: boolean;
  onTokenUpdated?: (newToken: string) => void;
}

export const SecuritySettingsCard: React.FC<SecuritySettingsCardProps> = ({
  bot,
  clientToken,
  isAdminMode = false,
  onTokenUpdated,
}) => {
  const toast = useToast();

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Real-time validations
  const isLengthValid = newPin.length >= 6;
  const isMatchValid = newPin === confirmPin && confirmPin.length > 0;
  const isWeak = ['000000', '111111', '123456', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '123123', '654321'].includes(newPin);
  const canSubmit = isLengthValid && isMatchValid && !isWeak && !saving;

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLengthValid) {
      toast.error('O novo PIN deve ter pelo menos 6 dígitos numéricos.');
      return;
    }
    if (!isMatchValid) {
      toast.error('A confirmação do PIN não coincide com o novo PIN digitado.');
      return;
    }
    if (isWeak) {
      toast.error('O PIN escolhido é muito fraco ou comum. Escolha uma combinação mais segura.');
      return;
    }
    setIsConfirmOpen(true);
  };

  const executeChangePin = async () => {
    try {
      setSaving(true);
      const res = await api.changeBotPin(bot.id, newPin, confirmPin, clientToken, isAdminMode);
      toast.success(res.message || 'PIN alterado com sucesso! Sessões anteriores invalidadas.');
      
      if (res.accessToken) {
        localStorage.setItem(`bot_token_${bot.id}`, res.accessToken);
        sessionStorage.setItem(`bot_auth_${bot.id}`, res.accessToken);
        if (onTokenUpdated) onTokenUpdated(res.accessToken);
      }

      setNewPin('');
      setConfirmPin('');
      setIsConfirmOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar o PIN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="settings-security" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Segurança & PIN de Acesso</h2>
            <p className="text-xs text-slate-400">Proteja as configurações do bot com uma senha forte de 6 dígitos</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-sky-400 font-mono">
          <ShieldCheck className="w-4 h-4" />
          <span>Hash Bcrypt Ativo</span>
        </div>
      </div>

      <form onSubmit={handleOpenConfirm} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Novo PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Novo PIN (Mínimo 6 dígitos)</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                maxLength={8}
                placeholder="••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-sm text-white placeholder-slate-500 tracking-widest font-mono focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirmar Novo PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Confirmar Novo PIN</label>
            <input
              type={showPin ? 'text' : 'password'}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              maxLength={8}
              placeholder="••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-sm text-white placeholder-slate-500 tracking-widest font-mono focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
            />
          </div>
        </div>

        {/* Validação de Segurança Dinâmica */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d] flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className={`flex items-center gap-1.5 ${isLengthValid ? 'text-sky-400' : 'text-slate-500'}`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Pelo menos 6 dígitos</span>
          </div>
          <div className={`flex items-center gap-1.5 ${isMatchValid ? 'text-sky-400' : 'text-slate-500'}`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>PINs coincidem</span>
          </div>
          {isWeak && (
            <div className="flex items-center gap-1.5 text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>PIN comum ou fraco</span>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            loading={saving}
            icon={<Lock className="w-3.5 h-3.5" />}
          >
            Atualizar PIN de Acesso
          </Button>
        </div>
      </form>

      {/* Modal de Confirmação Crítica */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Confirmar Alteração do PIN"
        message="Atenção: Ao alterar o PIN, todas as sessões ativas deste bot serão invalidadas e desconectadas. Você precisará do novo PIN para entrar novamente."
        confirmText="Confirmar e Alterar"
        cancelText="Voltar"
        variant="danger"
        onConfirm={executeChangePin}
        onCancel={() => setIsConfirmOpen(false)}
        loading={saving}
      />
    </div>
  );
};
