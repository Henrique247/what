import React, { useState } from 'react';
import { Bot as BotIcon, Copy, Check, Calendar, Activity, Image as ImageIcon } from 'lucide-react';
import { Bot } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface BotIdentityCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
  onSave?: () => void;
  saving?: boolean;
}

export const BotIdentityCard: React.FC<BotIdentityCardProps> = ({
  formData,
  onChange,
  onSave,
  saving = false,
}) => {
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = () => {
    if (formData.id) {
      navigator.clipboard.writeText(formData.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const formattedCreatedDate = formData.createdAt
    ? typeof formData.createdAt === 'string'
      ? new Date(formData.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
      : formData.createdAt.toDate
      ? formData.createdAt.toDate().toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Registado'
    : 'Recente';

  const formattedLastActive = formData.lastActiveAt
    ? new Date(formData.lastActiveAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
    : 'Ativo agora';

  return (
    <div id="settings-identity" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <BotIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Identidade do Bot</h2>
            <p className="text-xs text-zinc-400">Dados cadastrais e identificação da instância</p>
          </div>
        </div>

        <Badge
          variant={
            formData.status === 'Conectado'
              ? 'emerald'
              : formData.status === 'Conectando...'
              ? 'amber'
              : 'gray'
          }
          dot={formData.status === 'Conectado'}
        >
          {formData.status || 'Desconectado'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nome do Bot */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">
            Nome do Bot <span className="text-emerald-400">*</span>
          </label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="Ex: Assistente TechStar"
            className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Foto / Avatar URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">URL do Avatar / Foto do Perfil</label>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-[#151A1F] border border-[#22282F] flex items-center justify-center overflow-hidden shrink-0">
              {formData.avatarUrl ? (
                <img
                  src={formData.avatarUrl}
                  alt={formData.name || 'Bot'}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <span className="text-xs font-bold text-emerald-400">
                  {(formData.name || 'B').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <input
              type="url"
              value={formData.avatarUrl || ''}
              onChange={(e) => onChange('avatarUrl', e.target.value)}
              placeholder="https://exemplo.com/avatar.png"
              className="flex-1 px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
            />
          </div>
        </div>

        {/* Descrição do Bot */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-zinc-300">Descrição do Bot</label>
          <textarea
            rows={2}
            value={formData.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="Breve descrição da função e escopo do bot..."
            className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
          />
        </div>

        {/* Identificador / ID do Bot (Read-only) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">ID da Instância (Somente Leitura)</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={formData.id || ''}
              className="w-full px-3.5 py-2 rounded-xl bg-[#0B0E12] border border-[#22282F] text-xs text-zinc-400 font-mono select-all cursor-default"
            />
            <button
              type="button"
              onClick={handleCopyId}
              className="p-2 rounded-xl bg-[#101418] hover:bg-[#151A1F] border border-[#22282F] text-zinc-300 hover:text-white transition-colors shrink-0"
              title="Copiar ID do Bot"
            >
              {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Metadados Técnicos de Criação & Atividade */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-2.5 rounded-xl bg-[#0B0E12] border border-[#22282F]">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase font-semibold">
              <Calendar className="w-3 h-3" />
              <span>Criado Em</span>
            </div>
            <p className="text-xs text-zinc-300 mt-1 font-medium">{formattedCreatedDate}</p>
          </div>

          <div className="p-2.5 rounded-xl bg-[#0B0E12] border border-[#22282F]">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase font-semibold">
              <Activity className="w-3 h-3" />
              <span>Última Atividade</span>
            </div>
            <p className="text-xs text-emerald-400 mt-1 font-medium truncate">{formattedLastActive}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
