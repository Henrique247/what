import React, { useState } from 'react';
import { Shield, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

interface AdminLoginPageProps {
  onLoginSuccess: (sessionToken: string) => void;
  onNavigateHome: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLoginSuccess, onNavigateHome }) => {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error('Informe a chave de acesso do admin');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Chave de acesso incorreta');
      }

      toast.success('Login de Administrador bem-sucedido!');
      localStorage.setItem('techstar_admin_token', data.sessionToken);
      onLoginSuccess(data.sessionToken);
    } catch (err: any) {
      toast.error(err.message || 'Falha na autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F13] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#101418] border border-[#22282F] shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-inner">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">TECHSTAR ADMIN</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Painel Geral de Gerenciamento da Plataforma Multi-Bot WhatsApp
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Chave de Acesso do Administrador
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a chave (padrão: 123456)"
              className="w-full bg-[#151A1F] border border-[#22282F] rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 justify-center text-sm font-semibold shadow-lg shadow-emerald-950/50"
            disabled={loading}
          >
            {loading ? 'Autenticando...' : 'Entrar no Painel Admin'}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-[#22282F] text-center">
          <button
            onClick={onNavigateHome}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Voltar para seleção de bots
          </button>
        </div>
      </div>
    </div>
  );
};
