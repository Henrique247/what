import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error captured by ErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0F13] text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#151A1F] border border-red-500/30 rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Ocorreu um erro ao carregar a aplicação</h2>
            <p className="text-xs text-zinc-400 mb-6">
              Algo inesperado aconteceu no frontend. Tente atualizar a página.
            </p>
            {this.state.error && (
              <div className="mb-6 p-3 bg-[#0B0F13] rounded-lg border border-zinc-800 text-left overflow-x-auto">
                <p className="text-[11px] font-mono text-red-400">{this.state.error.toString()}</p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar Página
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
