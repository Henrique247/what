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
    <div id="settings-owner" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Proprietário do Bot</h2>
            <p className="text-xs text-zinc-400">Identificação e privilégios do dono do bot</p>
          </div>
        </div>

        <Badge
          variant={isVerified ? 'emerald' : 'amber'}
          dot={isVerified}
        >
          {isVerified ? 'Verificado' : 'Pendente de Verificação'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nome do Proprietário */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">
            Nome Completo do Proprietário
          </label>
          <input
            type="text"
            value={formData.ownerName || ''}
            onChange={(e) => onChange('ownerName', e.target.value)}
            placeholder="Ex: Mendes Tech"
            className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Número de WhatsApp */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-300">Número de WhatsApp (Dono)</label>
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
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
              placeholder="Ex: 244942272074"
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
            />
            <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* WhatsApp LID (Read-only) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">
            LID do WhatsApp (Identificador Criptográfico Seguro)
          </label>
          <div className="relative">
            <input
              type="text"
              readOnly
              value={formData.ownerLid || 'Sincronizado automaticamente ao conectar'}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#0B0E12] border border-[#22282F] text-xs text-zinc-400 font-mono select-all cursor-default"
            />
            <Fingerprint className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* Status de Permissões */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F] flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-200">Permissões de Gestão:</span>
            <span className="text-xs text-emerald-400 font-medium">Proprietário Pleno</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Comandos via WhatsApp liberados com proteção anti-spoofing por LID e Phone.
          </p>
        </div>
      </div>
    </div>
  );
};
