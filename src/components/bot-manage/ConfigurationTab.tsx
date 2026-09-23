import React, { useState } from 'react';
import { Bot } from '../../types';
import { Button } from '../ui/Button';
import { Save, RefreshCcw, SlidersHorizontal, MessageSquareText } from 'lucide-react';

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
      {/* Bloco 1: Instruções do Sistema (Comportamento Base) */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-[#626B79]" />
            <span className="text-xs font-semibold text-[#ECEED0]">Instruções do Sistema (System Prompt)</span>
          </div>
          <span className="text-[10px] font-mono text-[#626B79]">
            {formData.systemPrompt.length} CARACTERES
          </span>
        </div>
        <div className="p-4">
          <p className="text-[11px] text-[#9DA4B0] mb-3">
            Define a personalidade, regras de resposta e limites operacionais da IA para esta instância.
          </p>
          <textarea
            value={formData.systemPrompt}
            onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
            className="w-full h-48 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] p-3 text-[11px] font-mono text-[#ECEED0] placeholder-[#626B79] focus:outline-none focus:border-[#3A414D] resize-y leading-relaxed"
            placeholder="Ex: És o assistente virtual da TECHSTAR. Deves responder de forma concisa..."
          />
        </div>
      </div>

      {/* Bloco 2: Parâmetros do Motor IA */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#626B79]" />
            <span className="text-xs font-semibold text-[#ECEED0]">Parâmetros do Motor (Gemini AI)</span>
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Seleção de Modelo */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-[#626B79]">MODELO DE GERAÇÃO</label>
            <select
              value={formData.aiModel}
              onChange={(e) => setFormData({ ...formData, aiModel: e.target.value })}
              className="w-full h-9 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] px-3 text-xs font-mono text-[#ECEED0] focus:outline-none focus:border-[#3A414D]"
            >
              <option value="gemini-1.5-flash">gemini-1.5-flash (Rápido/Económico)</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro (Avançado/Raciocínio)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Alta Performance)</option>
              <option value="gemini-1.0-pro">gemini-1.0-pro (Legacy)</option>
            </select>
          </div>

          {/* Limite de Tokens */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-[#626B79]">MAX TOKENS DE SAÍDA</label>
            <input
              type="number"
              min={128}
              max={8192}
              value={formData.maxTokens}
              onChange={(e) => setFormData({ ...formData, maxTokens: Number(e.target.value) })}
              className="w-full h-9 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] px-3 text-xs font-mono text-[#ECEED0] focus:outline-none focus:border-[#3A414D]"
            />
          </div>

          {/* Temperatura */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-[#626B79]">TEMPERATURA (CRIATIVIDADE)</label>
              <span className="text-[11px] font-mono text-[#10B981]">{formData.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={formData.temperature}
              onChange={(e) => setFormData({ ...formData, temperature: Number(e.target.value) })}
              className="w-full accent-[#059669] h-1.5 bg-[#1E2228] rounded-[2px] appearance-none outline-none cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] text-[#626B79] font-mono">
              <span>0.0 (Preciso/Lógico)</span>
              <span>2.0 (Criativo/Caótico)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bloco 3: Permissões de Escuta do Baileys */}
      <div className="panel">
        <div className="panel-header">
          <span className="text-xs font-semibold text-[#ECEED0]">Regras de Interação (WhatsApp)</span>
        </div>
        <div className="p-4 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.respondInPrivate}
              onChange={(e) => setFormData({ ...formData, respondInPrivate: e.target.checked })}
              className="w-4 h-4 accent-[#059669] bg-[#090A0C] border-[#2A2F37] rounded-[2px]"
            />
            <div>
              <div className="text-xs font-medium text-[#ECEED0]">Responder em Chats Privados</div>
              <div className="text-[10px] text-[#626B79]">O bot irá analisar e responder a DMs recebidas neste número.</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.respondInGroups}
              onChange={(e) => setFormData({ ...formData, respondInGroups: e.target.checked })}
              className="w-4 h-4 accent-[#059669] bg-[#090A0C] border-[#2A2F37] rounded-[2px]"
            />
            <div>
              <div className="text-xs font-medium text-[#ECEED0]">Responder em Grupos (Menção/Comando)</div>
              <div className="text-[10px] text-[#626B79]">O bot operará em grupos nos quais foi adicionado, sujeito às regras de moderação.</div>
            </div>
          </label>
        </div>
      </div>

      {/* Barra de Ações (Save) */}
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
