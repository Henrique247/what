import React from 'react';
import { Users, Shield, Clock, AtSign, ArrowRight, MessageSquareQuote } from 'lucide-react';
import { Bot, ActiveTab } from '../../types';
import { Toggle } from '../ui/Toggle';
import { Button } from '../ui/Button';

interface GroupSettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
  onNavigateToTab?: (tab: ActiveTab) => void;
}

export const GroupSettingsCard: React.FC<GroupSettingsCardProps> = ({
  formData,
  onChange,
  onNavigateToTab,
}) => {
  return (
    <div id="settings-groups" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Comportamento em Grupos</h2>
            <p className="text-xs text-zinc-400">Diretrizes de intervenção, menções e saudações coletivas</p>
          </div>
        </div>

        {onNavigateToTab && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateToTab('groups')}
            icon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Abrir Gestor de Grupos
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {/* Responder em Grupos */}
        <Toggle
          label="Intervenção do Bot em Grupos"
          description="Quando ativado, o bot tem permissão para ler mensagens e responder dentro dos grupos de WhatsApp."
          checked={formData.respondInGroups === 1}
          onChange={(val) => onChange('respondInGroups', val ? 1 : 0)}
        />

        {/* Responder apenas por menção ou resposta */}
        <Toggle
          label="Responder Apenas Quando Mencionado ou Respondido (@)"
          description="Evita que o bot responda a todas as mensagens do grupo. Ele só falará se alguém o citar diretamente ou der 'Reply' em sua mensagem."
          checked={!!formData.respondOnlyOnMentionOrReply}
          onChange={(val) => onChange('respondOnlyOnMentionOrReply', val)}
        />

        {/* Cooldown entre respostas */}
        <div className="p-4 rounded-xl bg-[#101418] border border-[#22282F] space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Intervalo de Cooldown Entre Respostas em Grupos</span>
            </label>
            <span className="text-xs font-mono text-emerald-400 font-bold">
              {formData.responseCooldownSeconds || 3}s
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Tempo mínimo de espera antes que o bot possa emitir nova resposta no mesmo grupo para evitar poluição visual.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={formData.responseCooldownSeconds || 3}
              onChange={(e) => onChange('responseCooldownSeconds', Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-zinc-300 shrink-0">
              {formData.responseCooldownSeconds || 3} seg
            </span>
          </div>
        </div>

        {/* Boas-Vindas em Grupos */}
        <Toggle
          label="Mensagem de Boas-Vindas aos Novos Membros"
          description="Envia automaticamente uma mensagem de recepção quando um participante entrar no grupo."
          checked={formData.groupWelcomeEnabled === 1}
          onChange={(val) => onChange('groupWelcomeEnabled', val ? 1 : 0)}
        />

        {formData.groupWelcomeEnabled === 1 && (
          <div className="space-y-1.5 pl-4 border-l-2 border-emerald-500/30">
            <label className="text-xs font-medium text-zinc-300">
              Texto de Boas-Vindas nos Grupos
            </label>
            <textarea
              rows={2}
              value={formData.groupWelcomeMsg || ''}
              onChange={(e) => onChange('groupWelcomeMsg', e.target.value)}
              placeholder="Bem-vindo(a) ao grupo! Leia as regras e sinta-se à vontade..."
              className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
            />
          </div>
        )}

        {/* Mensagem de Saída de Grupos */}
        <Toggle
          label="Mensagem de Despedida ao Sair do Grupo"
          description="Notifica o grupo quando um participante sair ou for removido."
          checked={formData.groupExitEnabled === 1}
          onChange={(val) => onChange('groupExitEnabled', val ? 1 : 0)}
        />

        {formData.groupExitEnabled === 1 && (
          <div className="space-y-1.5 pl-4 border-l-2 border-emerald-500/30">
            <label className="text-xs font-medium text-zinc-300">
              Texto de Despedida (Grupos)
            </label>
            <textarea
              rows={2}
              value={formData.groupExitMsg || ''}
              onChange={(e) => onChange('groupExitMsg', e.target.value)}
              placeholder="Até breve! O participante deixou o grupo."
              className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
};
