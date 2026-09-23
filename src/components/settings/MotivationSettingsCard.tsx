import React, { useState } from 'react';
import { SunMedium, Send, Clock, Globe, Smile, Sparkles, Check, CheckCircle2 } from 'lucide-react';
import { Bot } from '../../types';
import { Toggle } from '../ui/Toggle';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { api } from '../../services/api';

interface MotivationSettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
  botId?: string;
  clientToken?: string;
  isAdminMode?: boolean;
}

const WEEK_DAYS = [
  { id: 'mon', label: 'Seg' },
  { id: 'tue', label: 'Ter' },
  { id: 'wed', label: 'Qua' },
  { id: 'thu', label: 'Qui' },
  { id: 'fri', label: 'Sex' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
];

export const MotivationSettingsCard: React.FC<MotivationSettingsCardProps> = ({
  formData,
  onChange,
  botId,
  clientToken,
  isAdminMode = false,
}) => {
  const toast = useToast();
  const [testingSend, setTestingSend] = useState(false);

  const selectedDays: string[] = formData.dailyMotivationDays || ['mon', 'tue', 'wed', 'thu', 'fri'];

  const toggleDay = (dayId: string) => {
    let next: string[];
    if (selectedDays.includes(dayId)) {
      next = selectedDays.filter((d) => d !== dayId);
    } else {
      next = [...selectedDays, dayId];
    }
    onChange('dailyMotivationDays', next);
  };

  const handleTestSend = async () => {
    if (!botId) {
      toast.error('Identificador do bot não encontrado');
      return;
    }
    try {
      setTestingSend(true);
      const res = await api.testBotMotivation(botId, clientToken, isAdminMode);
      toast.success(res.status || 'Mensagem motivacional gerada e despachada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao testar mensagem motivacional');
    } finally {
      setTestingSend(false);
    }
  };

  return (
    <div id="settings-motivation" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <SunMedium className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Motivação & Mensagens Automáticas
            </h2>
            <p className="text-xs text-slate-400">Agendamento de mensagens diárias para grupos ou privado</p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleTestSend}
          loading={testingSend}
          icon={<Send className="w-3.5 h-3.5" />}
        >
          Enviar Teste Agora
        </Button>
      </div>

      <div className="space-y-4">
        {/* Toggle Ativação Geral */}
        <Toggle
          label="Ativar Mensagens Diárias Automáticas"
          description="Envia reflexões, mensagens motivacionais ou comunicados recorrentes no horário programado."
          checked={!!formData.dailyMotivationEnabled}
          onChange={(val) => onChange('dailyMotivationEnabled', val)}
        />

        {formData.dailyMotivationEnabled && (
          <div className="space-y-4 pt-2 border-t border-[#142340]">
            {/* Título da Mensagem Personalizável */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Título do Cabeçalho da Mensagem
              </label>
              <input
                type="text"
                value={formData.dailyMotivationTitle || ''}
                onChange={(e) => onChange('dailyMotivationTitle', e.target.value)}
                placeholder="Ex: Mensagem do Dia, Reflexão Matinal..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
              />
            </div>

            {/* Toggle Emojis */}
            <Toggle
              label="Incluir Emojis nas Mensagens"
              description="Adiciona elementos gráficos visuais e emojis para enriquecer o texto."
              checked={formData.dailyMotivationUseEmoji !== false}
              onChange={(val) => onChange('dailyMotivationUseEmoji', val)}
            />

            {/* Modo de Geração */}
            <div className="p-4 rounded-xl bg-[#081021] border border-[#162a4d] space-y-2">
              <label className="text-xs font-semibold text-white">
                Modo de Conteúdo
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {[
                  { id: 'ai', label: 'Gerado por IA', desc: 'Reflexões únicas criadas diariamente pela IA' },
                  { id: 'fixed', label: 'Mensagem Fixa', desc: 'Texto padrão estabelecido por você' },
                  { id: 'rotating', label: 'Frases Rotativas', desc: 'Alterna entre pensamentos de um repertório' }
                ].map((mode) => {
                  const selected = (formData.dailyMotivationMode || 'ai') === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onChange('dailyMotivationMode', mode.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        selected
                          ? 'bg-sky-500/15 border-sky-400/50 text-white shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                          : 'bg-[#091326] border-[#162a4d] text-slate-400 hover:text-white'
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">{mode.label}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{mode.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mensagem Fixa ou Tópico de IA */}
            {formData.dailyMotivationMode === 'fixed' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Texto Fixo da Mensagem Diária
                </label>
                <textarea
                  rows={3}
                  value={formData.dailyMotivationFixedText || ''}
                  onChange={(e) => onChange('dailyMotivationFixedText', e.target.value)}
                  placeholder="Escreva a mensagem diária que será enviada aos seus contatos e grupos..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all resize-none leading-relaxed font-mono"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Tema ou Foco da Mensagem (Opcional para a IA)
                </label>
                <input
                  type="text"
                  value={formData.dailyMotivationTopic || ''}
                  onChange={(e) => onChange('dailyMotivationTopic', e.target.value)}
                  placeholder="Ex: Empreendedorismo, superação, gratidão, liderança..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all font-mono"
                />
              </div>
            )}

            {/* Configuração de Horário & Dias da Semana */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Horário do Disparo Diário</span>
                </label>
                <input
                  type="time"
                  value={formData.dailyMotivationTime || '08:00'}
                  onChange={(e) => onChange('dailyMotivationTime', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#081021] border border-[#1b3259] text-xs font-mono text-white focus:outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(14,165,233,0.25)] transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Dias da Semana com Envio
                </label>
                <div className="flex items-center gap-1.5 pt-1">
                  {WEEK_DAYS.map((day) => {
                    const active = selectedDays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDay(day.id)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                          active
                            ? 'bg-sky-500 text-white shadow-[0_0_8px_rgba(14,165,233,0.3)]'
                            : 'bg-[#081021] border border-[#142340] text-slate-500 hover:text-white'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
