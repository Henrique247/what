import React, { useState, useEffect } from 'react';
import { Bot, Lock, Key, ArrowRight, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';

interface BotLoginPageProps {
  botId: string;
  onLoginSuccess: (token: string) => void;
  onOpenForgotPin: () => void;
}

export const BotLoginPage: React.FC<BotLoginPageProps> = ({ botId, onLoginSuccess, onOpenForgotPin }) => {
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [botName, setBotName] = useState('Carregando bot...');
  const [firstAccessRequired, setFirstAccessRequired] = useState(false);

  useEffect(() => {
    fetch(`/api/bot/${botId}/public`)
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar informações');
        return res.json();
      })
      .then((data) => {
        if (data.name) setBotName(data.name);
        if (data.firstAccessRequired) setFirstAccessRequired(true);
      })
      .catch(() => {
        setBotName('Assistente TechStar');
      });
  }, [botId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) {
      toast.error('Informe o PIN de acesso do bot');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/bot/${botId}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'PIN incorreto');
      }

      if (data.firstAccessRequired) {
        setFirstAccessRequired(true);
        toast.info('Primeiro acesso detectado. Por favor, defina seu PIN de segurança.');
        return;
      }

      toast.success('Login realizado com sucesso!');
      localStorage.setItem(`bot_token_${botId}`, data.accessToken);
      onLoginSuccess(data.accessToken);
    } catch (err: any) {
      toast.error(err.message || 'PIN incorreto');
    } finally {
      setLoading(false);
    }
  };

  const handleSetFirstPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || !confirmPin) {
      toast.error('Preencha o PIN e a confirmação');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('Os PINs não coincidem');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/bot/${botId}/set-first-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, confirmPin })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao configurar PIN');
      }

      toast.success('PIN configurado com sucesso!');
      localStorage.setItem(`bot_token_${botId}`, data.accessToken);
      onLoginSuccess(data.accessToken);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao configurar PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050913] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md p-8 rounded-2xl bg-[#091326] border border-[#1b3259] shadow-[0_0_50px_rgba(14,165,233,0.15)] relative overflow-hidden z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-400 mb-4 shadow-[0_0_20px_rgba(14,165,233,0.3)]">
            <Bot className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-400/30 mb-2">
            {firstAccessRequired ? 'Primeiro Acesso - Configurar PIN' : 'Acesso do Proprietário'}
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">{botName}</h1>
          <p className="text-xs text-slate-400 mt-1">
            {firstAccessRequired 
              ? 'Defina um PIN seguro de 4 a 6 dígitos para o seu bot' 
              : 'Digite seu PIN de segurança para gerenciar este bot'}
          </p>
        </div>

        {firstAccessRequired ? (
          <form onSubmit={handleSetFirstPin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-sky-400" />
                Novo PIN (4 a 6 dígitos)
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Ex: 5839"
                maxLength={6}
                className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] tracking-widest text-center font-mono text-lg transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-sky-400" />
                Confirmar PIN
              </label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Confirme o PIN"
                maxLength={6}
                className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] tracking-widest text-center font-mono text-lg transition-all"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3 justify-center text-sm font-semibold shadow-lg shadow-sky-950/50"
              disabled={loading}
            >
              {loading ? 'Salvando PIN...' : 'Concluir Primeiro Acesso'}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-sky-400" />
                PIN de Acesso
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Digite seu PIN"
                maxLength={6}
                className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] tracking-widest text-center font-mono text-lg transition-all"
                autoFocus
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3 justify-center text-sm font-semibold shadow-lg shadow-sky-950/50"
              disabled={loading}
            >
              {loading ? 'Validando PIN...' : 'Entrar no Painel do Bot'}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>
        )}

        <div className="mt-6 pt-6 border-t border-[#142340] flex items-center justify-between">
          {!firstAccessRequired && (
            <button
              onClick={onOpenForgotPin}
              className="text-xs text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1 font-medium"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Esqueci o PIN
            </button>
          )}
          <a
            href="/"
            className="text-xs text-slate-400 hover:text-white transition-colors ml-auto"
          >
            Voltar ao Início
          </a>
        </div>
      </div>
    </div>
  );
};
