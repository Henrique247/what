import React, { useState } from 'react';
import { 
  Bot as BotIcon, 
  Sparkles, 
  User, 
  ShieldCheck, 
  Settings2, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  MessageSquare,
  Lock
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
      title="Criar Novo Bot de WhatsApp"
      description="Configure seu assistente com inteligência artificial em 3 etapas simples"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  step === s
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900'
                    : step > s
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                    : 'bg-[#151A1F] text-zinc-500 border border-[#22282F]'
                }`}
              >
                {step > s ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              <span className={`text-xs hidden sm:inline ${step === s ? 'text-zinc-200 font-medium' : 'text-zinc-500'}`}>
                {s === 1 && 'Identificação'}
                {s === 2 && 'Personalidade IA'}
                {s === 3 && 'Políticas & Canais'}
              </span>
              {s < 3 && <div className="w-8 sm:w-12 h-px bg-[#22282F] mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Identificação e Dono */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Nome do Bot <span className="text-emerald-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Atendimento Comercial, Suporte VIP, Assistente Dra. Ana"
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nome do Proprietário / Cliente
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Ex: Carlos Oliveira"
                  className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Telefone do Dono (com DDI/DDD)
                </label>
                <input
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="Ex: 5511999998888"
                  className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
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
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Instruções do Sistema (Prompt Principal)
              </label>
              <textarea
                rows={4}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Descreva quem o bot é, o tom de voz e como deve responder aos clientes..."
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg p-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 resize-y"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Mensagem de Boas-Vindas Automática
              </label>
              <input
                type="text"
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                placeholder="Ex: Olá! Seja bem-vindo à nossa empresa. Como posso te ajudar?"
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        )}

        {/* Step 3: Políticas e Toggles */}
        {step === 3 && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <Toggle
              label="Memória de Contexto"
              description="Permite que a IA lembre das mensagens anteriores da conversa do cliente."
              checked={memoryEnabled}
              onChange={setMemoryEnabled}
            />

            <Toggle
              label="Visão Computacional & Análise de Mídia"
              description="Permite que o bot entenda fotos e documentos PDF enviados pelos usuários."
              checked={analysisEnabled}
              onChange={setAnalysisEnabled}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Toggle
                label="Conversas Privadas"
                description="Responder clientes no 1 a 1."
                checked={respondInPrivate}
                onChange={setRespondInPrivate}
              />

              <Toggle
                label="Grupos de WhatsApp"
                description="Participar e responder em grupos."
                checked={respondInGroups}
                onChange={setRespondInGroups}
              />
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#22282F]">
          {step > 1 ? (
            <Button
              variant="outline"
              size="sm"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => setStep(step - 1)}
              disabled={loading}
            >
              Voltar
            </Button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={() => {
                if (step === 1 && !name.trim()) {
                  toast.error('Por favor, informe o nome do bot');
                  return;
                }
                setStep(step + 1);
              }}
            >
              Próximo
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              icon={<Check className="w-4 h-4" />}
              onClick={handleCreate}
            >
              Concluir e Criar Bot
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
