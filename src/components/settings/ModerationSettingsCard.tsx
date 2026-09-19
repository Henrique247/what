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
    <div id="settings-moderation" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Moderação de Conteúdo</h2>
            <p className="text-xs text-zinc-400">Proteção contra spam, links não autorizados e termos ofensivos</p>
          </div>
        </div>

        <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full font-medium">
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
          description="Inspeciona mensagens buscando termos e expressões cadastradas na lista negra."
          checked={!!formData.antiBadWordsEnabled}
          onChange={(val) => onChange('antiBadWordsEnabled', val)}
        />

        {formData.antiBadWordsEnabled && (
          <div className="space-y-1.5 pl-4 border-l-2 border-emerald-500/30">
            <label className="text-xs font-medium text-zinc-300">
              Palavras e Expressões Proibidas (separadas por vírgula)
            </label>
            <input
              type="text"
              value={formData.badWords || ''}
              onChange={(e) => onChange('badWords', e.target.value)}
              placeholder="exemplo1, palavra2, termo3..."
              className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        )}

        {/* Anti-Spam / Anti-Flood */}
        <Toggle
          label="Anti-Spam & Anti-Flood"
          description="Impede o envio excessivo de mensagens repetitivas em curto intervalo de tempo."
          checked={!!formData.antiSpamEnabled}
          onChange={(val) => onChange('antiSpamEnabled', val)}
        />

        {/* Imunidade para Administradores */}
        <Toggle
          label="Imunidade para Administradores do Grupo"
          description="Administradores e donos de grupos não sofrerão sanções pelas regras de moderação."
          checked={formData.adminImmunity !== false}
          onChange={(val) => onChange('adminImmunity', val)}
        />

        {/* Ação Padrão de Moderação */}
        <div className="p-4 rounded-xl bg-[#101418] border border-[#22282F] space-y-2.5">
          <label className="text-xs font-semibold text-zinc-200">
            Ação Padrão em Caso de Infração
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {[
              { id: 'warn', label: 'Apenas Avisar', desc: 'Emite advertência pública no grupo' },
              { id: 'delete', label: 'Apagar Mensagem', desc: 'Deleta a mensagem infratora' },
              { id: 'kick', label: 'Remover Membro', desc: 'Remove o autor da infração do grupo' }
            ].map((action) => {
              const selected = (formData.moderationAction || 'warn') === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onChange('moderationAction', action.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selected
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                      : 'bg-[#0B0E12] border-[#22282F] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <p className="text-xs font-semibold text-zinc-200">{action.label}</p>
                  <p className="text-[11px] text-zinc-500 mt-1">{action.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
