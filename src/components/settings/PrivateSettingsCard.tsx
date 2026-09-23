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
    <div id="settings-private" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Conversas Privadas (1:1)</h2>
            <p className="text-xs text-slate-400">Comportamento em mensagens diretas entre usuário e bot</p>
          </div>
        </div>

        <span className="text-[10px] text-sky-300 bg-sky-500/15 border border-sky-400/30 px-2.5 py-1 rounded-full font-semibold font-mono">
          Privado 1:1
        </span>
      </div>

      {/* Visual Notice */}
      <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d] flex items-center gap-2.5 text-xs text-slate-400">
        <Info className="w-4 h-4 text-sky-400 shrink-0" />
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

        {formData.privateWelcomeEnabled === 1 && (
          <div className="space-y-1.5 pl-4 border-l-2 border-sky-400/40">
            <label className="text-xs font-medium text-slate-300">
              Texto da Mensagem de Boas-Vindas
            </label>
            <textarea
              rows={2}
              value={formData.welcomeMsg || ''}
              onChange={(e) => onChange('welcomeMsg', e.target.value)}
              placeholder="Ex: Olá! Seja muito bem-vindo ao nosso canal de suporte. Como posso te ajudar?"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all resize-none font-mono"
            />
          </div>
        )}
      </div>
    </div>
  );
};
