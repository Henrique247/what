import React, { useState } from 'react';
import { 
  Bot as BotIcon, 
  Sparkles, 
  User, 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  MessageSquare,
  Lock,
  Phone,
  Sliders
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Toggle } from './ui/Toggle';
import { useToast } from './ui/Toast';
import { api } from '../services/api';

interface CreateBotWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onBotCreated: (newBotId: string) => void;
}

export const CreateBotWizard: React.FC<CreateBotWizardProps> = ({
  isOpen,
  onClose,
  onBotCreated,
}) => {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'Você é um assistente virtual atencioso, ágil e profissional. Responda com clareza, cordialidade e precisão.'
  );
  const [welcomeMsg, setWelcomeMsg] = useState('Olá! Como posso te ajudar hoje?');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [respondInGroups, setRespondInGroups] = useState(false);
  const [respondInPrivate, setRespondInPrivate] = useState(true);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);

  const resetForm = () => {
    setStep(1);
    setName('');
    setOwnerName('');
    setOwnerPhone('');
    setSystemPrompt('Você é um assistente virtual atencioso, ágil e profissional. Responda com clareza, cordialidade e precisão.');
    setWelcomeMsg('Olá! Como posso te ajudar hoje?');
    setMemoryEnabled(true);
    setRespondInGroups(false);
    setRespondInPrivate(true);
    setAnalysisEnabled(true);
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!name.trim()) {
        toast.error('Informe um nome para o bot');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Informe um nome para o bot');
      setStep(1);
      return;
    }

    try {
      setLoading(true);
      // 1. Criar bot no backend
      const result = await api.createBot(name.trim());
      const newBotId = result.id;

      // 2. Atualizar configurações iniciais com segurança
      await api.saveBotConfig(newBotId, {
        ownerName: ownerName.trim() || undefined,
        ownerPhone: ownerPhone.trim() || undefined,
        ownerNumber: ownerPhone.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
        welcomeMsg: welcomeMsg.trim(),
        memoryEnabled: memoryEnabled ? 1 : 0,
        respondInGroups: respondInGroups ? 1 : 0,
        respondInPrivate: respondInPrivate ? 1 : 0,
        analysisEnabled: analysisEnabled ? 1 : 0,
        privateWelcomeEnabled: 1,
        active: 1
      });

      toast.success(`Bot "${name}" criado com sucesso!`);
      resetForm();
      onClose();
      onBotCreated(newBotId);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar bot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!loading) {
          resetForm();
          onClose();
        }
      }}
      title="Criar Novo Agente WhatsApp"
      description="Configure seu assistente autônomo com inteligência artificial em 3 etapas simples"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Step Indicator with Cyber Cyan Styling */}
        <div className="flex items-center justify-between px-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-semibold transition-all ${
                  step === s
                    ? 'bg-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.5)] border border-sky-400'
                    : step > s
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-400/30'
                    : 'bg-[#0b1426] text-slate-500 border border-[#162a4d]'
                }`}
              >
                {step > s ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              <span className={`text-xs hidden sm:inline ${step === s ? 'text-white font-medium' : 'text-slate-400'}`}>
                {s === 1 && 'Identificação'}
                {s === 2 && 'Personalidade IA'}
                {s === 3 && 'Políticas & Canais'}
              </span>
              {s < 3 && <div className="w-8 sm:w-12 h-px bg-[#162a4d] mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Identificação e Dono */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <BotIcon className="w-3.5 h-3.5 text-sky-400" />
                Nome do Bot <span className="text-sky-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Atendimento Comercial, Suporte VIP, Assistente Dra. Ana"
                className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-400" />
                  Nome do Proprietário / Cliente
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Ex: Carlos Oliveira"
                  className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-sky-400" />
                  Telefone do Dono (com DDI/DDD)
                </label>
                <input
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="Ex: 5511999998888"
                  className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] font-mono transition-all"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Permite gerenciar o bot diretamente enviando mensagens no WhatsApp.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Personalidade e Instruções da IA */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                Instruções do Sistema (Prompt Principal)
              </label>
              <textarea
                rows={4}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Descreva quem o bot é, o tom de voz e como deve responder aos clientes..."
                className="w-full bg-[#081021] border border-[#1b3259] rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] font-mono resize-y leading-relaxed transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                Mensagem de Boas-Vindas Inicial
              </label>
              <input
                type="text"
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                placeholder="Ex: Olá! Seja bem-vindo ao nosso atendimento."
                className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
              />
            </div>
          </div>
        )}

        {/* Step 3: Políticas e Recursos */}
        {step === 3 && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <Toggle
              label="Memória de Contexto Contínua"
              description="Armazena o histórico recente das conversas para contextualização inteligente das respostas."
              checked={memoryEnabled}
              onChange={setMemoryEnabled}
            />

            <Toggle
              label="Atendimento em Mensagens Privadas (1 a 1)"
              description="O bot responderá imediatamente a contatos diretos no WhatsApp."
              checked={respondInPrivate}
              onChange={setRespondInPrivate}
            />

            <Toggle
              label="Interação e Moderação em Grupos"
              description="Permite que o bot responda em grupos quando for mencionado ou acionado."
              checked={respondInGroups}
              onChange={setRespondInGroups}
            />

            <Toggle
              label="Visão Computacional & Análise de Mídia"
              description="Habilita interpretação de imagens e PDFs com o Gemini Multimodal."
              checked={analysisEnabled}
              onChange={setAnalysisEnabled}
            />
          </div>
        )}

        {/* Wizard Controls Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-[#142340]">
          {step > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft className="w-3.5 h-3.5" />}
              onClick={handlePrevStep}
              disabled={loading}
            >
              Voltar
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
          )}

          {step < 3 ? (
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={handleNextStep}
            >
              Avançar
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={<Check className="w-3.5 h-3.5" />}
              loading={loading}
              onClick={handleCreate}
            >
              Finalizar & Criar Bot
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
