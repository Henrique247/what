import React from 'react';
import { User, ShieldCheck, AlertCircle, Phone, Fingerprint, CheckCircle2 } from 'lucide-react';
import { Bot } from '../../types';
import { Badge } from '../ui/Badge';

interface OwnerSettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
  isAdminMode?: boolean;
}

export const OwnerSettingsCard: React.FC<OwnerSettingsCardProps> = ({
  formData,
  onChange,
  isAdminMode = false,
}) => {
  const isVerified = formData.firstAccessCompleted || formData.ownerVerificationStatus === 'VERIFIED';

  return (
    <div id="settings-owner" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Proprietário do Bot</h2>
            <p className="text-xs text-slate-400">Identificação e privilégios do dono do bot</p>
          </div>
        </div>

        <Badge
          variant={isVerified ? 'cyan' : 'amber'}
          dot={isVerified}
        >
          {isVerified ? 'Verificado' : 'Pendente de Verificação'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nome do Proprietário */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">
            Nome Completo do Proprietário
          </label>
          <input
            type="text"
            value={formData.ownerName || ''}
            onChange={(e) => onChange('ownerName', e.target.value)}
            placeholder="Ex: Mendes Tech"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
          />
        </div>

        {/* Número de WhatsApp */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-300">Número de WhatsApp (Dono)</label>
            <span className="text-[10px] text-amber-300 flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" /> Alteração requer verificação
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={formData.ownerNumber || formData.ownerPhone || ''}
              onChange={(e) => {
                onChange('ownerNumber', e.target.value);
                onChange('ownerPhone', e.target.value);
              }}
              placeholder="Ex: 244923000000"
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
            />
            <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Privilégios Informativo */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d] md:col-span-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shrink-0">
              <Fingerprint className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Privilégios de Superusuário do Proprietário</p>
              <p className="text-[11px] text-slate-400 leading-snug">
                O número cadastrado pode emitir comandos especiais diretamente no chat privado com o bot (ex: reiniciar, pausar, status).
              </p>
            </div>
          </div>
          <span className="text-[10px] text-sky-400 font-semibold bg-sky-500/10 border border-sky-400/20 px-2.5 py-1 rounded-full shrink-0 font-mono">
            {formData.firstAccessCompleted ? 'Acesso Ativo' : 'Primeiro Acesso Pendente'}
          </span>
        </div>
      </div>
    </div>
  );
};
