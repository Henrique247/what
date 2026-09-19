import React from 'react';
import { MessageSquare, UserCheck, Shield, Sparkles, Brain, Info } from 'lucide-react';
import { Bot } from '../../types';
import { Toggle } from '../ui/Toggle';

interface PrivateSettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
}

export const PrivateSettingsCard: React.FC<PrivateSettingsCardProps> = ({
  formData,
  onChange,
}) => {
  return (
    <div id="settings-private" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Conversas Privadas (1:1)</h2>
            <p className="text-xs text-zinc-400">Comportamento em mensagens diretas entre usuário e bot</p>
          </div>
        </div>

        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
          Privado 1:1
        </span>
      </div>

      {/* Visual Notice */}
      <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F] flex items-center gap-2.5 text-xs text-zinc-400">
        <Info className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>Estas configurações são exclusivas para conversas privadas (1:1) e não afetam os grupos.</span>
      </div>

      <div className="space-y-4">
        {/* Responder em Privado */}
        <Toggle
          label="Responder em Conversas Privadas"
          description="Habilita respostas automáticas e atendimento inteligente no chat direto do WhatsApp."
          checked={formData.respondInPrivate === 1}
          onChange={(val) => onChange('respondInPrivate', val ? 1 : 0)}
        />

        {/* Memória em Conversas Privadas */}
        <Toggle
          label="Memória de Contexto em Conversas Privadas"
          description="Armazena o histórico recente das conversas 1:1 para que o bot recorde o contexto e preferências do interlocutor."
          checked={formData.memoryEnabled === 1}
          onChange={(val) => onChange('memoryEnabled', val ? 1 : 0)}
        />

        {/* Boas-vindas no Privado */}
        <Toggle
          label="Mensagem de Boas-Vindas no Privado"
          description="Envia uma saudação automática quando um novo contato inicia conversa pela primeira vez."
          checked={formData.privateWelcomeEnabled === 1}
          onChange={(val) => onChange('privateWelcomeEnabled', val ? 1 : 0)}
        />

        {/* Texto de Boas-Vindas se ativado */}
        {formData.privateWelcomeEnabled === 1 && (
          <div className="space-y-1.5 pl-4 border-l-2 border-emerald-500/30">
            <label className="text-xs font-medium text-zinc-300">
              Mensagem de Boas-Vindas (Privado)
            </label>
            <textarea
              rows={2}
              value={formData.welcomeMsg || ''}
              onChange={(e) => onChange('welcomeMsg', e.target.value)}
              placeholder="Olá! Seja bem-vindo ao meu canal de atendimento..."
              className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
};
