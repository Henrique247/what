import React, { useState } from 'react';
import { HelpCircle, User, Phone, Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

interface BotForgotPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  botId: string;
}

export const BotForgotPinModal: React.FC<BotForgotPinModalProps> = ({ isOpen, onClose, botId }) => {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      toast.error('Preencha o nome completo e o número de WhatsApp');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/bot/${botId}/forgot-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone, email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar solicitação');

      setSubmitted(true);
      toast.success('Solicitação enviada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar pedido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setSubmitted(false);
        setFullName('');
        setPhone('');
        setEmail('');
        onClose();
      }}
      title="Recuperação de Acesso ao Bot"
      description="Informe seus dados cadastrados para solicitar a redefinição do PIN ao Administrador"
      maxWidth="md"
    >
      {submitted ? (
        <div className="py-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/40 text-sky-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(14,165,233,0.3)]">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-white">Solicitação Recebida</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Se os dados corresponderem a um proprietário cadastrado, o pedido será processado e o administrador fará a redefinição do seu PIN.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              setSubmitted(false);
              onClose();
            }}
            className="mt-4"
          >
            Concluir
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-sky-400" />
              Nome Completo <span className="text-sky-400">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex: Henrique Mendes"
              className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-sky-400" />
              Número de WhatsApp do Dono <span className="text-sky-400">*</span>
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 5511999998888 ou 244923000000"
              className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-sky-400" />
              Email para Contato (Opcional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: henrique@empresa.com"
              className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#142340]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={loading}
              icon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Enviar Solicitação
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
