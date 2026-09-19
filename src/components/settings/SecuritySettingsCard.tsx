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
    <>
      <div id="settings-security" className="techstar-card p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                Segurança do Proprietário
              </h2>
              <p className="text-xs text-zinc-400">Autenticação por PIN criptografado e controle de sessões</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>PIN Configurado</span>
          </div>
        </div>

        {/* Informative notice */}
        <div className="p-3.5 rounded-xl bg-[#0B0E12] border border-[#22282F] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center justify-center text-zinc-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-200">Credencial Protegida por Hash Criptográfico</p>
              <p className="text-[11px] text-zinc-500">
                Por segurança, o PIN atual nunca é exibido ou retornado ao navegador.
              </p>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
            Hash scrypt/salt
          </span>
        </div>

        {/* Change PIN Form */}
        <form onSubmit={handleOpenConfirm} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Novo PIN */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Novo PIN de Acesso</span>
                <span className="text-[10px] text-zinc-500 font-normal">Mínimo 6 dígitos</span>
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  maxLength={12}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex: 948216"
                  className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors font-mono tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 absolute right-2.5 top-2 transition-colors"
                  title={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmar Novo PIN */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Confirmar Novo PIN</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  maxLength={12}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Repita o novo PIN"
                  className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors font-mono tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 absolute right-2.5 top-2 transition-colors"
                  title={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Validation Checklist */}
          {newPin.length > 0 && (
            <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F] text-xs space-y-1.5">
              <div className={`flex items-center gap-1.5 ${isLengthValid ? 'text-emerald-400' : 'text-zinc-500'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Pelo menos 6 dígitos numéricos</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isMatchValid ? 'text-emerald-400' : 'text-zinc-500'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirmação idêntica ao novo PIN</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!isWeak ? 'text-emerald-400' : 'text-rose-400'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>PIN seguro (sem sequências óbvias ou dígitos repetidos)</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-zinc-500">
              Ao alterar o PIN, todas as sessões ativas anteriores serão imediatamente invalidadas.
            </p>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!canSubmit}
            >
              Alterar PIN
            </Button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={executeChangePin}
        title="Confirmar Alteração do PIN"
        description="Tem a certeza de que deseja atualizar o seu PIN de acesso? Suas credenciais anteriores serão invalidadas e um novo token criptográfico será emitido."
        confirmText="Sim, Alterar PIN"
        cancelText="Voltar"
        variant="warning"
        loading={saving}
      />
    </>
  );
};
