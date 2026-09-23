import React, { useState } from 'react';
import { Shield, Lock, ArrowRight, Sparkles, Terminal } from 'lucide-react';
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
    <div className="min-h-screen bg-[#050913] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Cyber Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md p-8 rounded-2xl bg-[#091326] border border-[#1b3259] shadow-[0_0_50px_rgba(14,165,233,0.15)] relative overflow-hidden z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-400 mb-4 shadow-[0_0_20px_rgba(14,165,233,0.3)]">
            <Shield className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-400/30 mb-2">
            PAINEL CENTRAL ROOT
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">TECHSTAR ADMIN</h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestão global da infraestrutura e instâncias autônomas
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              Chave de Acesso do Administrador
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a chave (padrão: 123456)"
              className="w-full bg-[#081021] border border-[#1b3259] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] transition-all font-mono"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 justify-center text-sm font-semibold shadow-lg shadow-sky-950/50"
            disabled={loading}
          >
            {loading ? 'Autenticando...' : 'Entrar no Painel Admin'}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-[#142340] text-center">
          <button
            onClick={onNavigateHome}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            ← Voltar para seleção de bots
          </button>
        </div>
      </div>
    </div>
  );
};
