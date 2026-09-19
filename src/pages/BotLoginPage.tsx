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
    <div className="min-h-screen bg-[#0B0F13] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#101418] border border-[#22282F] shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-inner">
            <Bot className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            {firstAccessRequired ? 'Primeiro Acesso - Configurar PIN' : 'Acesso do Proprietário'}
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">{botName}</h1>
          <p className="text-xs text-zinc-400 mt-1">
            {firstAccessRequired 
              ? 'Defina um PIN seguro de 4 a 6 dígitos para o seu bot' 
              : 'Digite seu PIN de segurança para gerenciar este bot'}
          </p>
        </div>

        {firstAccessRequired ? (
          <form onSubmit={handleSetFirstPin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                Novo PIN (4 a 6 dígitos)
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Ex: 5839"
                maxLength={6}
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 tracking-widest text-center font-mono text-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                Confirmar PIN
              </label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Confirme o PIN"
                maxLength={6}
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 tracking-widest text-center font-mono text-lg"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3 justify-center text-sm font-semibold shadow-lg shadow-emerald-950/50"
              disabled={loading}
            >
              {loading ? 'Salvando PIN...' : 'Concluir Primeiro Acesso'}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                PIN de Acesso
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Digite seu PIN"
                maxLength={6}
                className="w-full bg-[#151A1F] border border-[#22282F] rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 tracking-widest text-center font-mono text-lg"
                autoFocus
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3 justify-center text-sm font-semibold shadow-lg shadow-emerald-950/50"
              disabled={loading}
            >
              {loading ? 'Validando PIN...' : 'Entrar no Painel do Bot'}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>
        )}

        <div className="mt-6 pt-6 border-t border-[#22282F] flex items-center justify-between">
          {!firstAccessRequired && (
            <button
              onClick={onOpenForgotPin}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 font-medium"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Esqueci o PIN
            </button>
          )}
          <a
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
          >
            Voltar ao Início
          </a>
        </div>
      </div>
    </div>
  );
};
