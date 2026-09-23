import React, { useState, useEffect } from 'react';
import { FileText, Download, Send, RefreshCw, CheckCircle2, AlertTriangle, Layers, Settings2, Sliders } from 'lucide-react';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { api } from '../services/api';

interface DocumentPdfCardProps {
  botId: string;
  clientToken?: string;
  isAdminMode: boolean;
  botName: string;
}

export const DocumentPdfCard: React.FC<DocumentPdfCardProps> = ({
  botId,
  clientToken,
  isAdminMode,
  botName
}) => {
  const toast = useToast();

  // Document Configuration State
  const [title, setTitle] = useState('Relatório Oficial de Atendimento');
  const [content, setContent] = useState(
    'Este documento formal certifica o relatório operacional gerado pelo assistente virtual.\n\nTodos os registros de interação, moderação de segurança e agendamentos foram processados com integridade e persistência em tempo real.'
  );
  const [pageSize, setPageSize] = useState<'A4' | 'A5' | 'LETTER'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [font, setFont] = useState<'Helvetica' | 'Times-Roman' | 'Courier'>('Helvetica');
  const [fontSize, setFontSize] = useState<number>(11);
  const [headerText, setHeaderText] = useState('TECHSTAR AI BOT PLATFORM • DOCUMENTO OFICIAL');
  const [footerText, setFooterText] = useState('Gerado automaticamente • Africa/Luanda');
  const [paginationEnabled, setPaginationEnabled] = useState(true);

  // Dispatch State
  const [targetJid, setTargetJid] = useState('');
  const [caption, setCaption] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Action status
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastSentResult, setLastSentResult] = useState<any | null>(null);

  // Fetch connected groups for easy selection
  useEffect(() => {
    const fetchGroups = async () => {
      setLoadingGroups(true);
      try {
        const list = await api.getBotGroups(botId, clientToken, isAdminMode);
        setGroups(list || []);
        if (list && list.length > 0 && !targetJid) {
          setTargetJid(list[0].groupId);
        }
      } catch {
        // Fallback
      } finally {
        setLoadingGroups(false);
      }
    };
    fetchGroups();
  }, [botId, clientToken, isAdminMode]);

  const handleDownload = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Informe o título e o conteúdo do documento.');
      return;
    }

    try {
      setGenerating(true);
      const blob = await api.generatePdfDocument(
        botId,
        {
          title,
          content,
          pageSize,
          orientation,
          font,
          fontSize,
          headerText,
          footerText,
          paginationEnabled
        },
        clientToken,
        isAdminMode
      );

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Documento PDF gerado e baixado com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao gerar arquivo PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSendViaWhatsApp = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Informe o título e o conteúdo do documento.');
      return;
    }
    if (!targetJid.trim()) {
      toast.error('Selecione ou informe o JID do destinatário (contato ou grupo).');
      return;
    }

    setSending(true);
    setLastSentResult(null);

    try {
      const res = await api.sendPdfViaWhatsApp(
        botId,
        {
          targetJid: targetJid.trim(),
          title,
          content,
          pageSize,
          orientation,
          font,
          fontSize,
          headerText,
          footerText,
          paginationEnabled,
          caption: caption.trim() || `📄 *${title}*`
        },
        clientToken,
        isAdminMode
      );

      setLastSentResult(res);
      toast.success(`PDF enviado com êxito! (ID: ${res.messageId || 'confirmado'})`);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao enviar PDF pelo WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-6 space-y-6 shadow-lg">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#142340]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Gerador & Emissor de Documentos PDF</h3>
              <p className="text-xs text-slate-400">
                Gere arquivos PDF profissionais e envie diretamente aos grupos ou contatos do WhatsApp com confirmação real.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={generating}
              onClick={handleDownload}
              icon={<Download className="w-4 h-4" />}
            >
              Baixar PDF
            </Button>
          </div>
        </div>

        {/* Form Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content (2 Cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Título do Documento *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Regulamento Interno / Relatório de Vendas"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Conteúdo / Texto do Documento *
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="Digite ou cole aqui o conteúdo detalhado do documento..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono leading-relaxed resize-y"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                O motor PDFKit ajustará automaticamente as quebras de linha e criará novas páginas quando necessário.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Texto do Cabeçalho (Opcional)
                </label>
                <input
                  type="text"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Ex: TECHSTAR • DOCUMENTO OFICIAL"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Texto do Rodapé (Opcional)
                </label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Ex: Confidencial • Emitido via Bot"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
                />
              </div>
            </div>
          </div>

          {/* Formatting & Sending Options (1 Col) */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#081021] border border-[#162a4d] space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Settings2 className="w-4 h-4 text-sky-400" />
                <span>Layout & Tipografia</span>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Tamanho da Página</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#091326] border border-[#1b3259] text-xs text-white focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
                >
                  <option value="A4">A4 (210 x 297 mm)</option>
                  <option value="A5">A5 (148 x 210 mm)</option>
                  <option value="LETTER">Carta / Letter</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Orientação</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#091326] border border-[#1b3259] text-xs text-white focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
                >
                  <option value="portrait">Vertical (Retrato / Portrait)</option>
                  <option value="landscape">Horizontal (Paisagem / Landscape)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Família Tipográfica</label>
                <select
                  value={font}
                  onChange={(e) => setFont(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#091326] border border-[#1b3259] text-xs text-white focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
                >
                  <option value="Helvetica">Helvetica (Moderna / Sans-serif)</option>
                  <option value="Times-Roman">Times New Roman (Clássica / Serif)</option>
                  <option value="Courier">Courier (Monospaçada / Técnica)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Tamanho da Fonte ({fontSize}pt)</label>
                <input
                  type="range"
                  min={9}
                  max={16}
                  step={1}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-sky-400"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#142340]">
                <span className="text-[11px] text-slate-300 font-medium">Numeração de Páginas</span>
                <input
                  type="checkbox"
                  checked={paginationEnabled}
                  onChange={(e) => setPaginationEnabled(e.target.checked)}
                  className="rounded accent-sky-400"
                />
              </div>
            </div>

            {/* WhatsApp Dispatch Section */}
            <div className="p-4 rounded-xl bg-[#081021] border border-sky-500/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                <Send className="w-4 h-4" />
                <span>Envio Direto pelo WhatsApp</span>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Destinatário</label>
                {groups.length > 0 ? (
                  <select
                    value={targetJid}
                    onChange={(e) => setTargetJid(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#091326] border border-[#1b3259] text-xs text-white focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono mb-2"
                  >
                    <optgroup label="Grupos Conectados">
                      {groups.map((g) => (
                        <option key={g.groupId} value={g.groupId}>
                          {g.groupName || g.groupId}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                ) : null}

                <input
                  type="text"
                  value={targetJid}
                  onChange={(e) => setTargetJid(e.target.value)}
                  placeholder="Ou digite o JID / Telefone (ex: 244942272074@s.whatsapp.net)"
                  className="w-full px-3 py-2 rounded-xl bg-[#091326] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Legenda (Opcional)</label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Ex: Segue em anexo o documento solicitado."
                  className="w-full px-3 py-2 rounded-xl bg-[#091326] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                className="w-full"
                loading={sending}
                onClick={handleSendViaWhatsApp}
                icon={<Send className="w-4 h-4" />}
              >
                Emitir e Enviar via WhatsApp
              </Button>

              {lastSentResult && (
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/30 text-sky-400 text-xs flex items-start gap-2 shadow-[0_0_10px_rgba(14,165,233,0.15)]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-white">Documento Despachado!</p>
                    <p className="text-[10px] text-sky-300 font-mono">ID da Mensagem: {lastSentResult.messageId}</p>
                    {lastSentResult.durationMs && (
                      <p className="text-[10px] text-slate-400">Tempo de envio: {lastSentResult.durationMs}ms</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
