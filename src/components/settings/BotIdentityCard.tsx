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
    <div id="settings-identity" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <BotIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Identidade do Bot</h2>
            <p className="text-xs text-slate-400">Dados cadastrais e identificação da instância</p>
          </div>
        </div>

        <Badge
          variant={
            formData.status === 'Conectado'
              ? 'cyan'
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
          <label className="text-xs font-medium text-slate-300">
            Nome do Bot <span className="text-sky-400">*</span>
          </label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="Ex: Assistente TechStar"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
          />
        </div>

        {/* Foto / Avatar URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">URL do Avatar / Foto do Perfil</label>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#081021] border border-[#162a4d] flex items-center justify-center overflow-hidden shrink-0">
              {formData.avatarUrl ? (
                <img
                  src={formData.avatarUrl}
                  alt={formData.name || 'Bot'}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <span className="text-xs font-bold text-sky-400 font-mono">
                  {(formData.name || 'B').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <input
              type="url"
              value={formData.avatarUrl || ''}
              onChange={(e) => onChange('avatarUrl', e.target.value)}
              placeholder="https://exemplo.com/avatar.png"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
            />
          </div>
        </div>

        {/* Descrição do Bot */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-300">Descrição do Bot</label>
          <textarea
            rows={2}
            value={formData.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="Breve descrição da função e escopo do bot..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all resize-none"
          />
        </div>

        {/* Identificador / ID do Bot (Read-only) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">ID da Instância (Somente Leitura)</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={formData.id || ''}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#162a4d] text-xs text-slate-400 font-mono select-all cursor-default"
            />
            <button
              type="button"
              onClick={handleCopyId}
              className="p-2.5 rounded-xl bg-[#081021] hover:bg-[#0f1d38] border border-[#162a4d] text-slate-300 hover:text-white transition-colors shrink-0"
              title="Copiar ID do Bot"
            >
              {copiedId ? <Check className="w-4 h-4 text-sky-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Metadados Técnicos de Criação & Atividade */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-xl bg-[#081021] border border-[#162a4d]">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
              <Calendar className="w-3 h-3 text-sky-400" />
              <span>Criado Em</span>
            </div>
            <p className="text-xs text-slate-300 mt-1 font-medium font-mono">{formattedCreatedDate}</p>
          </div>

          <div className="p-3 rounded-xl bg-[#081021] border border-[#162a4d]">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
              <Activity className="w-3 h-3 text-sky-400" />
              <span>Última Atividade</span>
            </div>
            <p className="text-xs text-sky-400 mt-1 font-medium font-mono truncate">{formattedLastActive}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
