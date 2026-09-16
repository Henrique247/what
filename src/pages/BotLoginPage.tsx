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
  const [loading, setLoading] = useState(false);
  const [botName, setBotName] = useState('Carregando bot...');

  useEffect(() => {
    // Load basic bot metadata for display
    api.getBotConfig(botId, undefined, true).then((b) => {
      setBotName(b.name || 'Assistente TechStar');
    }).catch(() => {
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

      toast.success('Login realizado com sucesso!');
      localStorage.setItem(`bot_token_${botId}`, data.accessToken);
      onLoginSuccess(data.accessToken);
    } catch (err: any) {
      toast.error(err.message || 'PIN incorreto');
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
            Acesso do Proprietário
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">{botName}</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Digite seu PIN de segurança para gerenciar este bot
          </p>
        </div>

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
              placeholder="Digite o PIN (padrão: 1234)"
              maxLength={8}
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

        <div className="mt-6 pt-6 border-t border-[#22282F] flex items-center justify-between">
          <button
            onClick={onOpenForgotPin}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 font-medium"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Esqueci o PIN
          </button>
          <a
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Voltar ao Início
          </a>
        </div>
      </div>
    </div>
  );
};
