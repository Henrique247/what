import React from 'react';
import { ShieldAlert, Ban, AlertTriangle, Link as LinkIcon, ShieldCheck, Flame } from 'lucide-react';
import { Bot } from '../../types';
import { Toggle } from '../ui/Toggle';

interface ModerationSettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
}

export const ModerationSettingsCard: React.FC<ModerationSettingsCardProps> = ({
  formData,
  onChange,
}) => {
  return (
    <div id="settings-moderation" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Moderação de Conteúdo</h2>
            <p className="text-xs text-slate-400">Proteção contra spam, links não autorizados e termos impróprios</p>
          </div>
        </div>

        <span className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 rounded-full font-semibold font-mono">
          Defesa Ativa
        </span>
      </div>

      {/* Warning Notice */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/90 leading-relaxed">
          <strong className="font-semibold text-amber-300">Aviso Importante:</strong> Para apagar mensagens ou remover participantes automaticamente, o bot <strong>precisa ser Administrador</strong> do respectivo grupo no WhatsApp.
        </div>
      </div>

      <div className="space-y-4">
        {/* Anti-Link */}
        <Toggle
          label="Anti-Link (Bloqueio de URLs e Convites)"
          description="Detecta mensagens contendo hiperlinks ou links de convite de outros grupos."
          checked={!!formData.antiLinkEnabled}
          onChange={(val) => onChange('antiLinkEnabled', val)}
        />

        {/* Anti-Palavrões */}
        <Toggle
          label="Filtro de Palavras Proibidas e Conteúdo Ofensivo"
          description="Inspeciona mensagens buscando termos e expressões cadastradas na lista de restrições."
          checked={!!formData.antiBadWordsEnabled}
          onChange={(val) => onChange('antiBadWordsEnabled', val)}
        />

        {formData.antiBadWordsEnabled && (
          <div className="space-y-1.5 pl-4 border-l-2 border-sky-400/40">
            <label className="text-xs font-medium text-slate-300">
              Lista de Palavras e Termos Bloqueados (separados por vírgula)
            </label>
            <textarea
              rows={2}
              value={formData.badWordsList || ''}
              onChange={(e) => onChange('badWordsList', e.target.value)}
              placeholder="Ex: palavra1, termo2, expressao_proibida"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all resize-none font-mono"
            />
          </div>
        )}

        {/* Anti-Spam / Rate Limit */}
        <Toggle
          label="Anti-Spam (Proteção contra Flooding de Mensagens)"
          description="Monitora a frequência de envio por usuário em janelas curtas de tempo."
          checked={!!formData.antiSpamEnabled}
          onChange={(val) => onChange('antiSpamEnabled', val)}
        />

        {formData.antiSpamEnabled && (
          <div className="space-y-1.5 pl-4 border-l-2 border-sky-400/40">
            <label className="text-xs font-medium text-slate-300">
              Limite Máximo de Mensagens por Janela de 10 Segundos
            </label>
            <input
              type="number"
              min={2}
              max={20}
              value={formData.antiSpamMaxMessages || 5}
              onChange={(e) => onChange('antiSpamMaxMessages', parseInt(e.target.value) || 5)}
              className="w-32 px-3 py-1.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white font-mono focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
            />
          </div>
        )}

        {/* Ação Punitiva */}
        <div className="space-y-2 p-4 rounded-xl bg-[#081021] border border-[#162a4d]">
          <label className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Ban className="w-4 h-4 text-rose-400" />
            <span>Ação Punitiva ao Detectar Violação</span>
          </label>
          <select
            value={formData.moderationAction || 'delete'}
            onChange={(e) => onChange('moderationAction', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#091326] border border-[#1b3259] text-xs text-white focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
          >
            <option value="delete">Apenas Apagar Mensagem (Menor atrito)</option>
            <option value="warn">Apagar e Advertir Publicamente o Usuário</option>
            <option value="kick">Remover Infrator Imediatamente do Grupo (Kick)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
