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
  ShieldCheck,
  Battery,
  PhoneCall
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
      {isConnected && (
        <div className="panel border-[#10B981]/30 bg-[#10B981]/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/30 flex items-center justify-center text-[#10B981]">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#ECEED0]">Sessão WhatsApp Ativa</h3>
                <p className="text-xs font-mono text-[#10B981] mt-0.5">Socket estabelecido com sucesso via Baileys API</p>
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

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-[#1E2228] font-mono text-xs">
            <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
              <span className="text-[10px] text-[#626B79] block uppercase">JID / LINHA</span>
              <span className="text-[#ECEED0] font-medium mt-0.5 block">{bot.ownerPhone || bot.ownerNumber || 'Linha Ativa'}</span>
            </div>
            <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
              <span className="text-[10px] text-[#626B79] block uppercase">NOME NO PERFIL</span>
              <span className="text-[#ECEED0] font-medium mt-0.5 block truncate">{bot.ownerName || bot.name || '—'}</span>
            </div>
            <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
              <span className="text-[10px] text-[#626B79] block uppercase">MOTOR SOCKET</span>
              <span className="text-[#ECEED0] font-medium mt-0.5 block">Baileys Multi-Device</span>
            </div>
            <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px]">
              <span className="text-[10px] text-[#626B79] block uppercase">ESTADO DE LINHA</span>
              <span className="text-[#10B981] font-medium flex items-center gap-1.5 mt-0.5">
                <Battery className="w-3.5 h-3.5" /> ONLINE / 100%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Estado Desconectado ou Aguardando Conexão */}
      {!isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Painel de Emparelhamento (Esquerda) */}
          <div className="md:col-span-7 panel">
            <div className="panel-header">
              <span className="text-xs font-semibold text-[#ECEED0]">Emparelhar Dispositivo</span>
              <div className="flex bg-[#090A0C] p-0.5 border border-[#2A2F37] rounded-[4px]">
                <button
                  onClick={() => setMode('qr')}
                  className={`px-2.5 py-1 text-[10px] font-mono rounded-[3px] transition-colors ${
                    mode === 'qr' ? 'bg-[#16191E] text-white font-medium' : 'text-[#626B79] hover:text-[#9DA4B0]'
                  }`}
                >
                  QR Code
                </button>
                <button
                  onClick={() => setMode('code')}
                  className={`px-2.5 py-1 text-[10px] font-mono rounded-[3px] transition-colors ${
                    mode === 'code' ? 'bg-[#16191E] text-white font-medium' : 'text-[#626B79] hover:text-[#9DA4B0]'
                  }`}
                >
                  Código Numérico
                </button>
              </div>
            </div>

            <div className="p-6 flex flex-col items-center justify-center min-h-[320px]">
              {mode === 'qr' ? (
                <div className="text-center space-y-4">
                  {qrCodeUrl ? (
                    <div className="p-3 bg-white rounded-[4px] border border-[#2A2F37] inline-block shadow-lg">
                      <img src={qrCodeUrl} alt="WhatsApp QR Code" className="w-52 h-52 object-contain" />
                    </div>
                  ) : (
                    <div className="w-52 h-52 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] flex flex-col items-center justify-center p-4">
                      <QrCode className="w-10 h-10 text-[#626B79] animate-pulse mb-2" />
                      <span className="text-[11px] font-mono text-[#626B79] text-center leading-relaxed">
                        A aguardar geração do QR Code pelo motor Baileys...
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<RefreshCw className="w-3.5 h-3.5" />}
                      onClick={onRefreshQR}
                    >
                      Atualizar QR Code
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-sm space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-[#626B79]">NÚMERO DE TELEFONE (COM DDI)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="Ex: 5511999999999"
                        className="flex-1 h-9 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] px-3 text-xs font-mono text-[#ECEED0] focus:outline-none focus:border-[#3A414D]"
                      />
                      <Button
                        size="md"
                        variant="primary"
                        icon={<PhoneCall className="w-3.5 h-3.5" />}
                        loading={loadingCode}
                        onClick={handleGetPairingCode}
                      >
                        Gerar
                      </Button>
                    </div>
                  </div>

                  {generatedCode && (
                    <div className="p-4 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] space-y-2 text-center animate-in fade-in">
                      <span className="text-[10px] font-mono text-[#626B79] uppercase block">Código de Emparelhamento</span>
                      <div className="text-xl font-mono font-bold text-[#10B981] tracking-widest bg-[#16191E] border border-[#2A2F37] py-2 rounded-[4px]">
                        {generatedCode}
                      </div>
                      <button
                        onClick={copyCodeToClipboard}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#9DA4B0] hover:text-white mt-1 transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copiado!' : 'Copiar Código'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Guia de Instruções Operacionais (Direita) */}
          <div className="md:col-span-5 panel">
            <div className="panel-header">
              <span className="text-xs font-semibold text-[#ECEED0]">Procedimento de Ligação</span>
            </div>
            <div className="p-4 space-y-4 text-xs text-[#9DA4B0]">
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-[4px] bg-[#16191E] border border-[#2A2F37] text-white font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <p>Abra o <strong>WhatsApp</strong> no smartphone dedicado a esta instância.</p>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-[4px] bg-[#16191E] border border-[#2A2F37] text-white font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <p>Aceda a <strong>Definições / Menu</strong> &gt; <strong>Aparelhos Conectados</strong> &gt; <strong>Conectar um Aparelho</strong>.</p>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-[4px] bg-[#16191E] border border-[#2A2F37] text-white font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <p>Aponte a câmara para o <strong>QR Code</strong> ou selecione <strong>"Conectar com número de telefone"</strong> e insira o código numérico gerado.</p>
              </div>

              <div className="p-3 bg-[#090A0C] border border-[#1E2228] rounded-[4px] mt-6 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#626B79] leading-relaxed font-mono">
                  Sessão encriptada de ponta a ponta persistida no servidor Baileys Multi-Device.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
