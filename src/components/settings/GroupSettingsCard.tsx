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
    <div id="settings-groups" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Comportamento em Grupos</h2>
            <p className="text-xs text-slate-400">Diretrizes de intervenção, menções e saudações coletivas</p>
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
        <div className="space-y-1.5 p-4 rounded-xl bg-[#081021] border border-[#162a4d]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Intervalo de Cooldown entre Mensagens no Grupo (Segundos)</span>
            </label>
            <span className="text-xs font-mono text-sky-300 font-semibold">{formData.groupCooldownSeconds || 3}s</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Evita que o bot responda em rajadas consecutivas muito rápidas, tornando a interação mais humana.
          </p>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={formData.groupCooldownSeconds || 3}
            onChange={(e) => onChange('groupCooldownSeconds', parseInt(e.target.value) || 3)}
            className="w-full accent-sky-400"
          />
        </div>

        {/* Boas-Vindas a Novos Membros no Grupo */}
        <Toggle
          label="Mensagem de Boas-Vindas Automática para Novos Membros"
          description="Saúda participantes que acabaram de entrar no grupo com uma mensagem personalizada."
          checked={!!formData.groupWelcomeEnabled}
          onChange={(val) => onChange('groupWelcomeEnabled', val)}
        />

        {formData.groupWelcomeEnabled && (
          <div className="space-y-1.5 pl-4 border-l-2 border-sky-400/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Modelo da Mensagem de Boas-Vindas
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Use @user e @group como tags</span>
            </div>
            <textarea
              rows={2}
              value={formData.groupWelcomeMsg || ''}
              onChange={(e) => onChange('groupWelcomeMsg', e.target.value)}
              placeholder="Ex: Olá @user, seja muito bem-vindo ao @group! Leia as regras fixadas."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all resize-none font-mono"
            />
          </div>
        )}
      </div>
    </div>
  );
};
