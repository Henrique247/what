import React, { useState } from 'react';
import { SunMedium, Send, Clock, Globe, Smile, Sparkles, Check, CheckCircle2 } from 'lucide-react';
import { Bot } from '../../types';
import { Toggle } from '../ui/Toggle';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

interface MotivationSettingsCardProps {
  formData: Partial<Bot>;
  onChange: (key: keyof Bot, value: any) => void;
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

  const handleTestSend = () => {
    setTestingSend(true);
    setTimeout(() => {
      setTestingSend(false);
      toast.success('Disparo de teste simulado com sucesso nos canais configurados!');
    }, 1200);
  };

  return (
    <div id="settings-motivation" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <SunMedium className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
              Motivação & Mensagens Automáticas
            </h2>
            <p className="text-xs text-zinc-400">Agendamento de mensagens diárias para grupos ou privado</p>
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
          <div className="space-y-4 pt-2 border-t border-[#22282F]">
            {/* Título da Mensagem Personalizável */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Título do Cabeçalho da Mensagem
              </label>
              <input
                type="text"
                value={formData.dailyMotivationTitle || ''}
                onChange={(e) => onChange('dailyMotivationTitle', e.target.value)}
                placeholder="Ex: Mensagem do Dia, Reflexão Matinal..."
                className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
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
            <div className="p-4 rounded-xl bg-[#101418] border border-[#22282F] space-y-2">
              <label className="text-xs font-semibold text-zinc-200">
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
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selected
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                          : 'bg-[#0B0E12] border-[#22282F] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <p className="text-xs font-semibold text-zinc-200">{mode.label}</p>
                      <p className="text-[11px] text-zinc-500 mt-1">{mode.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mensagem Fixa ou Tópico de IA */}
            {formData.dailyMotivationMode === 'fixed' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Texto Fixo da Mensagem Diária
                </label>
                <textarea
                  rows={3}
                  value={formData.dailyMotivationFixedText || ''}
                  onChange={(e) => onChange('dailyMotivationFixedText', e.target.value)}
                  placeholder="Escreva a mensagem diária que será enviada aos seus contatos e grupos..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Tema ou Foco da Mensagem (Opcional para a IA)
                </label>
                <input
                  type="text"
                  value={formData.dailyMotivationTopic || ''}
                  onChange={(e) => onChange('dailyMotivationTopic', e.target.value)}
                  placeholder="Ex: Empreendedorismo, superação, gratidão, liderança..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#101418] border border-[#22282F] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            )}

            {/* Horário e Fuso Horário */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#101418] border border-[#22282F]">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Horário de Envio</span>
                </label>
                <input
                  type="time"
                  value={formData.dailyMotivationTime || '08:00'}
                  onChange={(e) => onChange('dailyMotivationTime', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0E12] border border-[#22282F] text-sm text-zinc-100 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Fuso Horário Oficial</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value="Africa/Luanda (UTC+1)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0E12] border border-[#22282F] text-xs text-zinc-400 font-mono cursor-default"
                />
              </div>
            </div>

            {/* Dias da Semana */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">
                Dias de Disparo Semanal
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((day) => {
                  const isChecked = selectedDays.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleDay(day.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        isChecked
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-xs'
                          : 'bg-[#101418] border-[#22282F] text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
