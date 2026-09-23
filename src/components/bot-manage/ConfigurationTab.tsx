import React, { useState } from 'react';
import { Bot } from '../../types';
import { Button } from '../ui/Button';
import { Save, RefreshCcw, SlidersHorizontal, MessageSquareText, Sparkles, Cpu } from 'lucide-react';

interface ConfigurationTabProps {
  bot: Bot;
  onSave: (updatedData: Partial<Bot>) => Promise<void>;
}

export const ConfigurationTab: React.FC<ConfigurationTabProps> = ({ bot, onSave }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    systemPrompt: bot.systemPrompt || '',
    aiModel: bot.aiModel || 'gemini-1.5-flash',
    temperature: bot.temperature ?? 0.7,
    maxTokens: bot.maxTokens || 2048,
    respondInPrivate: (bot.respondInPrivate === 1 || bot.respondInPrivate === true),
    respondInGroups: (bot.respondInGroups === 1 || bot.respondInGroups === true),
  });

  const hasChanges = 
    formData.systemPrompt !== (bot.systemPrompt || '') ||
    formData.aiModel !== (bot.aiModel || 'gemini-1.5-flash') ||
    formData.temperature !== (bot.temperature ?? 0.7) ||
    formData.maxTokens !== (bot.maxTokens || 2048) ||
    formData.respondInPrivate !== (bot.respondInPrivate === 1 || bot.respondInPrivate === true) ||
    formData.respondInGroups !== (bot.respondInGroups === 1 || bot.respondInGroups === true);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        systemPrompt: formData.systemPrompt,
        aiModel: formData.aiModel,
        temperature: formData.temperature,
        maxTokens: formData.maxTokens,
        respondInPrivate: formData.respondInPrivate ? 1 : 0,
        respondInGroups: formData.respondInGroups ? 1 : 0,
      } as Partial<Bot>);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setFormData({
      systemPrompt: bot.systemPrompt || '',
      aiModel: bot.aiModel || 'gemini-1.5-flash',
      temperature: bot.temperature ?? 0.7,
      maxTokens: bot.maxTokens || 2048,
      respondInPrivate: (bot.respondInPrivate === 1 || bot.respondInPrivate === true),
      respondInGroups: (bot.respondInGroups === 1 || bot.respondInGroups === true),
    });
  };

  return (
    <div className="space-y-6 max-w-4xl select-none">
      {/* Bloco 1: Instruções do Sistema (System Prompt) */}
      <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-[#142340] flex items-center justify-between bg-[#081021]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400">
              <MessageSquareText className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-white">Instruções do Sistema (System Prompt)</span>
              <p className="text-[10px] text-slate-400">Diretrizes centrais de raciocínio, tom e conduta da IA</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-400/20">
            {formData.systemPrompt.length} CARACTERES
          </span>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-400 mb-3">
            Define a persona, as regras de resposta, limites operacionais e scripts de atendimento desta instância.
          </p>
          <textarea
            value={formData.systemPrompt}
            onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
            className="w-full h-48 bg-[#081021] border border-[#1b3259] rounded-xl p-3.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] resize-y leading-relaxed transition-all"
            placeholder="Ex: És o assistente virtual da TECHSTAR. Deves responder de forma concisa, cordial e profissional..."
          />
        </div>
      </div>

      {/* Bloco 2: Parâmetros do Motor IA */}
      <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-[#142340] flex items-center gap-2.5 bg-[#081021]">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-semibold text-white">Parâmetros do Motor (Gemini AI)</span>
            <p className="text-[10px] text-slate-400">Ajuste fino de temperatura, tokens e arquitetura</p>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Seleção de Modelo */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-slate-400">MODELO DE GERAÇÃO</label>
            <select
              value={formData.aiModel}
              onChange={(e) => setFormData({ ...formData, aiModel: e.target.value })}
              className="w-full h-10 bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] transition-all"
            >
              <option value="gemini-1.5-flash">gemini-1.5-flash (Rápido / Baixa Latência)</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro (Raciocínio Profundo / Complexo)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Alta Performance / Recomendado)</option>
              <option value="gemini-1.0-pro">gemini-1.0-pro (Compatibilidade Legacy)</option>
            </select>
          </div>

          {/* Limite de Tokens */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-slate-400">MAX TOKENS DE SAÍDA</label>
            <input
              type="number"
              min={128}
              max={8192}
              value={formData.maxTokens}
              onChange={(e) => setFormData({ ...formData, maxTokens: Number(e.target.value) })}
              className="w-full h-10 bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] transition-all"
            />
          </div>

          {/* Temperatura */}
          <div className="space-y-2 md:col-span-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-slate-400">TEMPERATURA (NÍVEL DE CRIATIVIDADE)</label>
              <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-400/30">
                {formData.temperature}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={formData.temperature}
              onChange={(e) => setFormData({ ...formData, temperature: Number(e.target.value) })}
              className="w-full accent-sky-400 h-2 bg-[#081021] rounded-lg appearance-none outline-none cursor-pointer border border-[#142340]"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>0.0 (Extremamente Preciso & Lógico)</span>
              <span>1.0 (Balanceado)</span>
              <span>2.0 (Criativo / Variável)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bloco 3: Permissões de Escuta do Baileys */}
      <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-[#142340] bg-[#081021]">
          <span className="text-xs font-semibold text-white">Regras de Escuta e Canais (WhatsApp)</span>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-3.5 p-3 rounded-xl bg-[#081021] border border-[#142340] hover:border-sky-500/30 cursor-pointer select-none transition-all">
            <input
              type="checkbox"
              checked={formData.respondInPrivate}
              onChange={(e) => setFormData({ ...formData, respondInPrivate: e.target.checked })}
              className="w-4 h-4 accent-sky-500 bg-[#0b1426] border-[#1b3259] rounded"
            />
            <div>
              <div className="text-xs font-semibold text-white">Responder em Conversas Privadas (1 a 1)</div>
              <div className="text-[11px] text-slate-400">O bot irá analisar e responder a DMs recebidas nesta linha telefônica.</div>
            </div>
          </label>

          <label className="flex items-center gap-3.5 p-3 rounded-xl bg-[#081021] border border-[#142340] hover:border-sky-500/30 cursor-pointer select-none transition-all">
            <input
              type="checkbox"
              checked={formData.respondInGroups}
              onChange={(e) => setFormData({ ...formData, respondInGroups: e.target.checked })}
              className="w-4 h-4 accent-sky-500 bg-[#0b1426] border-[#1b3259] rounded"
            />
            <div>
              <div className="text-xs font-semibold text-white">Responder em Grupos (Menção / Comandos)</div>
              <div className="text-[11px] text-slate-400">O bot operará em grupos nos quais foi adicionado, sujeito às políticas de moderação.</div>
            </div>
          </label>
        </div>
      </div>

      {/* Barra de Ações (Save / Discard) */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button 
          size="md" 
          variant="ghost"
          icon={<RefreshCcw className="w-3.5 h-3.5" />} 
          onClick={handleDiscard}
          disabled={!hasChanges}
        >
          Descartar Alterações
        </Button>
        <Button 
          size="md" 
          variant="primary" 
          icon={<Save className="w-3.5 h-3.5" />} 
          loading={isSaving} 
          onClick={handleSave}
          disabled={!hasChanges && !isSaving}
        >
          Gravar Configurações
        </Button>
      </div>
    </div>
  );
};
