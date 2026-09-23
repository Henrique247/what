import React, { useState } from 'react';
import { Bot } from '../../types';
import { Button } from '../ui/Button';
import { 
  QrCode, 
  CheckCircle2, 
  RefreshCw, 
  Unlink, 
  Copy, 
  Check, 
  Smartphone,
  PhoneCall,
  ShieldCheck,
  Radio,
  Clock
} from 'lucide-react';

interface WhatsAppConnectionTabProps {
  bot: Bot;
  qrCodeUrl?: string; // Base64 ou URL do QR Code gerado pelo Baileys
  connectionStatus?: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';
  onRefreshQR: () => void;
  onDisconnect: () => Promise<void>;
  onRequestPairingCode: (phoneNumber: string) => Promise<string | null>;
}

export const WhatsAppConnectionTab: React.FC<WhatsAppConnectionTabProps> = ({
  bot,
  qrCodeUrl,
  connectionStatus = bot.status === 'Conectado' ? 'CONNECTED' : (qrCodeUrl ? 'QR_READY' : 'DISCONNECTED'),
  onRefreshQR,
  onDisconnect,
  onRequestPairingCode
}) => {
  const [mode, setMode] = useState<'qr' | 'code'>('qr');
  const [phoneInput, setPhoneInput] = useState(bot.ownerPhone || bot.ownerNumber || '');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleGetPairingCode = async () => {
    if (!phoneInput.trim()) return;
    setLoadingCode(true);
    try {
      const code = await onRequestPairingCode(phoneInput.trim());
      setGeneratedCode(code);
    } finally {
      setLoadingCode(false);
    }
  };

  const copyCodeToClipboard = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshQR();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDisconnectClick = async () => {
    setIsDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = connectionStatus === 'CONNECTED' || bot.status === 'Conectado';

  return (
    <div className="space-y-6 max-w-4xl select-none">
      {/* Estado Ativo: Instância Conectada */}
      {isConnected ? (
        <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-sky-400/30 p-6 shadow-[0_0_30px_rgba(14,165,233,0.15)] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.3)]">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Sessão WhatsApp Ativa</h3>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-400/20">
                    ESTÁVEL
                  </span>
                </div>
                <p className="text-xs font-mono text-sky-300 mt-1">Socket estabelecido com sucesso via Baileys API</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="danger"
              icon={<Unlink className="w-3.5 h-3.5" />}
              loading={isDisconnecting}
              onClick={handleDisconnectClick}
            >
              Encerrar Sessão
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-[#162a4d] font-mono text-xs">
            <div className="p-3.5 bg-[#081021] border border-[#142340] rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">JID / LINHA</span>
              <span className="text-white font-medium mt-1 block truncate">
                {(bot as any).connectedPhone || bot.ownerPhone || bot.ownerNumber || 'Linha Conectada'}
              </span>
            </div>
            <div className="p-3.5 bg-[#081021] border border-[#142340] rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">DISPOSITIVO</span>
              <span className="text-white font-medium mt-1 block">WhatsApp Web (Baileys)</span>
            </div>
            <div className="p-3.5 bg-[#081021] border border-[#142340] rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">PERFIL ATIVO</span>
              <span className="text-white font-medium mt-1 block truncate">{bot.name}</span>
            </div>
            <div className="p-3.5 bg-[#081021] border border-[#142340] rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">SEGURANÇA</span>
              <span className="text-sky-400 font-medium mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                Criptografia E2E
              </span>
            </div>
          </div>

          {/* Status de Persistência Cloud & Anti-Queda de Deploy */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs">
            <div className="flex items-start gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)] mt-1 shrink-0" />
              <div>
                <span className="text-emerald-300 font-semibold block">Persistência em Nuvem Firestore Ativa</span>
                <span className="text-slate-400 text-[11px] leading-relaxed block">
                  As chaves e credenciais criptográficas estão sincronizadas no Firestore. Em atualizações do sistema ou novos deploys, a conexão do WhatsApp permanece ativa e reconecta automaticamente sem necessidade de novo QR Code.
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono rounded-lg border border-emerald-500/30 font-semibold whitespace-nowrap self-start sm:self-auto">
              IMUNE A DEPLOYS
            </span>
          </div>
        </div>
      ) : (
        /* Sessão Desconectada: Opções de Conexão (QR Code / Pairing Code) */
        <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] overflow-hidden shadow-lg">
          {/* Header com seletor de modo */}
          <div className="px-5 py-4 border-b border-[#142340] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#081021]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-white">Emparelhamento de Sessão WhatsApp</span>
                <p className="text-[10px] text-slate-400">Autenticação instantânea via QR Code ou Código Numérico</p>
              </div>
            </div>

            {/* Alternador de Modo */}
            <div className="flex items-center bg-[#091429] p-1 rounded-xl border border-[#1b3259]">
              <button
                type="button"
                onClick={() => setMode('qr')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  mode === 'qr'
                    ? 'bg-sky-500 text-white font-semibold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                QR Code
              </button>
              <button
                type="button"
                onClick={() => setMode('code')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  mode === 'code'
                    ? 'bg-sky-500 text-white font-semibold shadow-[0_0_10px_rgba(14,165,233,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Código por Telefone
              </button>
            </div>
          </div>

          <div className="p-6">
            {mode === 'qr' ? (
              /* Modo QR Code */
              <div className="flex flex-col items-center justify-center space-y-5">
                <div className="relative p-4 rounded-2xl bg-white shadow-2xl border-4 border-[#1b3259]">
                  {qrCodeUrl ? (
                    <img 
                      src={qrCodeUrl} 
                      alt="WhatsApp QR Code" 
                      className="w-56 h-56 object-contain"
                    />
                  ) : (
                    <div className="w-56 h-56 flex flex-col items-center justify-center bg-slate-900 rounded-xl text-slate-400 text-center p-4">
                      <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mb-3" />
                      <span className="text-xs font-mono text-slate-300">Gerando QR Code...</span>
                      <span className="text-[10px] text-slate-500 mt-1">Aguarde o handshake do Baileys</span>
                    </div>
                  )}
                </div>

                <div className="text-center max-w-sm space-y-1.5">
                  <h4 className="text-xs font-semibold text-white">Como conectar via QR Code:</h4>
                  <ol className="text-[11px] text-slate-400 list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Abra o WhatsApp no seu smartphone</li>
                    <li>Acesse <strong>Aparelhos Conectados &gt; Conectar um Aparelho</strong></li>
                    <li>Aponte a câmera para o QR Code acima</li>
                  </ol>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    loading={isRefreshing}
                    onClick={handleRefreshClick}
                  >
                    Atualizar QR Code
                  </Button>
                </div>
              </div>
            ) : (
              /* Modo Pairing Code por Telefone */
              <div className="max-w-md mx-auto space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-sky-400" />
                    Número do WhatsApp (com DDI e DDD)
                  </label>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Ex: 5511999998888 ou 244923000000"
                    className="w-full h-10 bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] transition-all"
                  />
                  <p className="text-[10px] text-slate-400">
                    Insira o número completo sem espaços, hífens ou caracteres especiais (+).
                  </p>
                </div>

                <Button
                  size="md"
                  variant="primary"
                  className="w-full justify-center"
                  loading={loadingCode}
                  onClick={handleGetPairingCode}
                  disabled={!phoneInput.trim()}
                >
                  Solicitar Código de 8 Dígitos
                </Button>

                {generatedCode && (
                  <div className="p-4 rounded-xl bg-[#081021] border border-sky-400/30 text-center space-y-3">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                      Código de Emparelhamento Gerado
                    </span>
                    <div className="text-2xl font-mono font-bold text-sky-400 tracking-widest bg-[#0b162c] py-2 px-4 rounded-lg border border-sky-400/20 inline-block shadow-[0_0_15px_rgba(14,165,233,0.2)]">
                      {generatedCode}
                    </div>
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={copied ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5" />}
                        onClick={copyCodeToClipboard}
                      >
                        {copied ? 'Copiado!' : 'Copiar Código'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      No WhatsApp do celular, toque na notificação de vinculação ou em Aparelhos Conectados &gt; Conectar com número de telefone e digite o código acima.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
