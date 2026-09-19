import React, { useState } from 'react';
import { Sparkles, Brain, Cpu, ShieldCheck, FileText, KeyRound, Check, RefreshCw, Eye, EyeOff, Trash2, Send } from 'lucide-react';
import { Bot } from '../../types';
import { Toggle } from '../ui/Toggle';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { api } from '../../services/api';

interface AISettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
  botId?: string;
  clientToken?: string;
  isAdminMode?: boolean;
}

export const AISettingsCard: React.FC<AISettingsCardProps> = ({
  formData,
  onChange,
  botId,
  clientToken,
  isAdminMode = false,
}) => {
  const toast = useToast();
  const isAiActive = formData.aiEnabled !== false;
  const currentModel = formData.aiModel || 'gemini-2.5-flash';

  const [customKeyInput, setCustomKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [hasDedicatedKey, setHasDedicatedKey] = useState(!!formData.hasGeminiKeys);

  const handleTestKey = async () => {
    if (!botId) {
      toast.error('Identificador do bot não encontrado');
      return;
    }
    try {
      setTestingKey(true);
      const res = await api.testGeminiKey(
        botId, 
        customKeyInput.trim() || undefined, 
        currentModel, 
        clientToken, 
        isAdminMode
      );
      toast.success(res.message || 'Conexão com Gemini validada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao testar chave Gemini');
    } finally {
      setTestingKey(false);
    }
  };

  const handleSaveKey = async () => {
    if (!botId) return;
    if (!customKeyInput.trim()) {
      toast.error('Digite a chave Gemini que deseja configurar.');
      return;
    }
    try {
      setSavingKey(true);
      const res = await api.updateAiSettings(
        botId,
        {
          geminiKeys: customKeyInput.trim(),
          aiModel: currentModel,
          aiEnabled: isAiActive,
          systemPrompt: formData.systemPrompt
        },
        clientToken,
        isAdminMode
      );
      toast.success('Chave de API Gemini configurada e ativada com sucesso!');
      setCustomKeyInput('');
      setHasDedicatedKey(true);
      onChange('hasGeminiKeys', true);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar chave Gemini');
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveCustomKey = async () => {
    if (!botId) return;
    try {
      setSavingKey(true);
      await api.updateAiSettings(
        botId,
        {
          removeGeminiKeys: true,
          aiModel: currentModel,
          aiEnabled: isAiActive
        },
        clientToken,
        isAdminMode
      );
      toast.success('Chave dedicada removida. O bot utilizará o pool compartilhado do servidor.');
      setHasDedicatedKey(false);
      onChange('hasGeminiKeys', false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover chave personalizada');
    } finally {
      setSavingKey(false);
    }
  };

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
            {hasDedicatedKey ? 'Chave Dedicada' : 'Pool Global'}
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

        {/* Chaves de IA Gemini - Gerenciamento Seguro Multitenant */}
        <div className="p-4 rounded-xl bg-[#101418] border border-[#22282F] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <label className="text-xs font-semibold text-zinc-200">
                Chaves de API Gemini (Google AI Studio)
              </label>
            </div>

            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
              hasDedicatedKey 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}>
              {hasDedicatedKey ? 'Chave Dedicada Ativa' : 'Pool Padrão do Servidor'}
            </span>
          </div>

          <p className="text-[11px] text-zinc-400 leading-snug">
            Configure sua chave própria da API Google Gemini para ter cotas exclusivas e maior limite de requisições. 
            Por segurança rigorosa, os valores brutos das chaves são armazenados no servidor e <strong>nunca expostos no navegador</strong>.
          </p>

          <div className="space-y-2">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                placeholder={hasDedicatedKey ? '•••••••••••••••••••••••• (Chave salva no servidor)' : 'Insira sua chave de API Gemini (AIzaSy...)'}
                className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-[#0B0E12] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTestKey}
                loading={testingKey}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Testar Conexão
              </Button>

              {customKeyInput.trim().length > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveKey}
                  loading={savingKey}
                  icon={<Check className="w-3.5 h-3.5" />}
                >
                  Salvar Chave
                </Button>
              )}

              {hasDedicatedKey && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRemoveCustomKey}
                  loading={savingKey}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Remover e Usar Pool Global
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Segurança Criptográfica Informativo */}
        <div className="p-3.5 rounded-xl bg-[#0B0E12] border border-[#22282F] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-200">
                Blindagem Criptográfica Multitenant
              </p>
              <p className="text-[11px] text-zinc-500">
                O backend atua como autoridade isolada. Rotação automática e backoff exponencial ativados para evitar erros 429.
              </p>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full shrink-0">
            Segurança Nível SaaS
          </span>
        </div>
      </div>
    </div>
  );
};
