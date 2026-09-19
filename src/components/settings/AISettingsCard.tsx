import React from 'react';
import { Sparkles, Brain, Cpu, ShieldCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { Bot } from '../../types';
import { Toggle } from '../ui/Toggle';
import { Badge } from '../ui/Badge';

interface AISettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
}

export const AISettingsCard: React.FC<AISettingsCardProps> = ({
  formData,
  onChange,
}) => {
  const isAiActive = formData.aiEnabled !== false;
  const currentModel = formData.aiModel || 'gemini-2.5-flash';

  return (
    <div id="settings-ai" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Inteligência Artificial (IA)</h2>
            <p className="text-xs text-zinc-400">Motor de processamento cognitivo e modelos Gemini</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={isAiActive ? 'emerald' : 'gray'} dot={isAiActive}>
            {isAiActive ? 'IA Ativa & Pronta' : 'IA Desativada'}
          </Badge>
          <span className="text-[10px] text-zinc-400 px-2 py-0.5 rounded bg-[#101418] border border-[#22282F] font-mono">
            Fallback Ativo
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Toggle Ativação Geral da IA */}
        <Toggle
          label="Processamento com Inteligência Artificial"
          description="Quando ativado, mensagens elegíveis recebem respostas geradas pelo motor Gemini contextualizado."
          checked={isAiActive}
          onChange={(val) => onChange('aiEnabled', val)}
        />

        {/* Modelo Gemini Selection */}
        <div className="space-y-2 p-4 rounded-xl bg-[#101418] border border-[#22282F]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>Modelo de Linguagem Gemini</span>
            </label>
            <span className="text-[10px] text-zinc-500">Google DeepMind</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onChange('aiModel', 'gemini-2.5-flash')}
              className={`p-3 rounded-xl border text-left transition-all ${
                currentModel === 'gemini-2.5-flash'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                  : 'bg-[#0B0E12] border-[#22282F] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Gemini 2.5 Flash</span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                  Recomendado
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                Velocidade ultrarrápida, alta precisão conversacional e menor latência para mensagens no WhatsApp.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onChange('aiModel', 'gemini-2.5-pro')}
              className={`p-3 rounded-xl border text-left transition-all ${
                currentModel === 'gemini-2.5-pro'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                  : 'bg-[#0B0E12] border-[#22282F] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Gemini 2.5 Pro</span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
                  Raciocínio Avançado
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                Capacidade analítica aprofundada para instruções complexas e documentos extensos.
              </p>
            </button>
          </div>
        </div>

        {/* Análise de Mídia e Arquivos */}
        <Toggle
          label="Análise de Mídia (Fotos, Áudio e Documentos PDF)"
          description="Permite que o bot transcreva áudios recebidos, interprete fotos e analise documentos enviados pelos usuários."
          checked={formData.analysisEnabled === 1}
          onChange={(val) => onChange('analysisEnabled', val ? 1 : 0)}
        />

        {/* Instruções de Análise se ativado */}
        {formData.analysisEnabled === 1 && (
          <div className="space-y-1.5 pl-4 border-l-2 border-emerald-500/30">
            <label className="text-xs font-medium text-zinc-300">
              Instruções Específicas para Análise Multimodal
            </label>
            <textarea
              rows={2}
              value={formData.analysisInstructions || ''}
              onChange={(e) => onChange('analysisInstructions', e.target.value)}
              placeholder="Ex: Priorize resumir o conteúdo principal de faturas ou identificar produtos em fotos..."
              className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            />
          </div>
        )}

        {/* System Prompt Principal */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Prompt Base do Sistema (Personalidade & Regras Gerais)</span>
            </label>
            <span className="text-[10px] text-zinc-500">Injetado em todas as requisições</span>
          </div>
          <textarea
            rows={3}
            value={formData.systemPrompt || ''}
            onChange={(e) => onChange('systemPrompt', e.target.value)}
            placeholder="Você é um assistente prestativo, educado e objetivo..."
            className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
          />
        </div>

        {/* Chaves de IA (Proteção Criptográfica Multitenant) */}
        <div className="p-3.5 rounded-xl bg-[#0B0E12] border border-[#22282F] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-200">
                Chaves de API Gemini Blindadas no Servidor
              </p>
              <p className="text-[11px] text-zinc-500">
                As credenciais da API são geridas exclusivamente pelo backend. O frontend nunca tem acesso aos valores brutos das chaves.
              </p>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full shrink-0">
            Pool Ativo & Gerenciado
          </span>
        </div>
      </div>
    </div>
  );
};
