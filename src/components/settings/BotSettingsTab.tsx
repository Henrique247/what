import React, { useState } from 'react';
import { 
  Save, 
  Check, 
  AlertCircle, 
  Bot as BotIcon, 
  User, 
  KeyRound, 
  Sparkles, 
  MessageSquare, 
  Users, 
  ShieldAlert, 
  SunMedium, 
  QrCode, 
  Info, 
  AlertTriangle 
} from 'lucide-react';
import { Bot, ActiveTab, BotStats } from '../../types';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { api } from '../../services/api';

import { BotIdentityCard } from './BotIdentityCard';
import { OwnerSettingsCard } from './OwnerSettingsCard';
import { SecuritySettingsCard } from './SecuritySettingsCard';
import { AISettingsCard } from './AISettingsCard';
import { PrivateSettingsCard } from './PrivateSettingsCard';
import { GroupSettingsCard } from './GroupSettingsCard';
import { ModerationSettingsCard } from './ModerationSettingsCard';
import { MotivationSettingsCard } from './MotivationSettingsCard';
import { WhatsAppSettingsCard } from './WhatsAppSettingsCard';
import { TechnicalInfoCard } from './TechnicalInfoCard';
import { DangerZoneCard } from './DangerZoneCard';

interface BotSettingsTabProps {
  bot: Bot;
  clientToken?: string;
  isAdminMode?: boolean;
  onUpdateBot: (updated: Bot) => void;
  onNavigateToTab?: (tab: ActiveTab) => void;
  onBotDeleted?: () => void;
  stats?: BotStats | null;
}

const SECTION_LINKS = [
  { id: 'settings-identity', label: 'Identidade', icon: <BotIcon className="w-3.5 h-3.5" /> },
  { id: 'settings-owner', label: 'Proprietário', icon: <User className="w-3.5 h-3.5" /> },
  { id: 'settings-security', label: 'Segurança', icon: <KeyRound className="w-3.5 h-3.5" /> },
  { id: 'settings-ai', label: 'Inteligência (IA)', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'settings-private', label: 'Privado', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { id: 'settings-groups', label: 'Grupos', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'settings-moderation', label: 'Moderação', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  { id: 'settings-motivation', label: 'Motivação', icon: <SunMedium className="w-3.5 h-3.5" /> },
  { id: 'settings-whatsapp', label: 'Conexão', icon: <QrCode className="w-3.5 h-3.5" /> },
  { id: 'settings-info', label: 'Informações', icon: <Info className="w-3.5 h-3.5" /> },
  { id: 'settings-danger', label: 'Zona Crítica', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
];

export const BotSettingsTab: React.FC<BotSettingsTabProps> = ({
  bot,
  clientToken,
  isAdminMode = false,
  onUpdateBot,
  onNavigateToTab,
  onBotDeleted,
  stats,
}) => {
  const toast = useToast();

  const [formData, setFormData] = useState<Partial<Bot>>({ ...bot });
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync formData if external bot prop changes
  React.useEffect(() => {
    setFormData({ ...bot });
    setHasChanges(false);
  }, [bot.id]);

  const handleChange = (key: keyof Bot, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await api.saveBotConfig(bot.id, formData, clientToken, isAdminMode);
      toast.success(res.status || 'Configurações do bot salvas e persistidas com sucesso!');
      setHasChanges(false);
      if (res.config) {
        onUpdateBot({ ...bot, ...res.config });
      } else {
        onUpdateBot({ ...bot, ...formData } as Bot);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao persistir configurações');
    } finally {
      setSaving(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Quick Section Anchor Navigation Bar */}
      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-[#0B0E12] border border-[#22282F] overflow-x-auto scrollbar-none sticky top-16 z-20 backdrop-blur-md bg-opacity-90">
        <span className="text-[10px] text-zinc-500 font-semibold uppercase px-2 whitespace-nowrap">
          Navegação:
        </span>
        {SECTION_LINKS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => scrollToSection(sec.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-[#151A1F] transition-colors whitespace-nowrap"
          >
            {sec.icon}
            <span>{sec.label}</span>
          </button>
        ))}

        <div className="ml-auto pl-2 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={saving}
            icon={hasChanges ? <Save className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          >
            {hasChanges ? 'Guardar Alterações' : 'Guardado'}
          </Button>
        </div>
      </div>

      {/* Change Banner Alert */}
      {hasChanges && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Existem alterações pendentes. Lembre-se de clicar em <strong>Guardar Alterações</strong>.</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={saving}
          >
            Guardar Agora
          </Button>
        </div>
      )}

      {/* Content Cards */}
      <div className="space-y-6">
        {/* 1. Identidade do Bot */}
        <BotIdentityCard
          formData={formData}
          onChange={handleChange}
          onSave={handleSave}
          saving={saving}
        />

        {/* 2. Proprietário */}
        <OwnerSettingsCard
          formData={formData}
          onChange={handleChange}
          isAdminMode={isAdminMode}
        />

        {/* 3. PIN do Proprietário (Segurança) */}
        <SecuritySettingsCard
          bot={bot}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
          onTokenUpdated={(newToken) => {
            // Updated token handled
          }}
        />

        {/* 4. Inteligência Artificial (IA) */}
        <AISettingsCard
          formData={formData}
          onChange={handleChange}
          botId={bot.id}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
        />

        {/* 5. Conversas Privadas (1:1) */}
        <PrivateSettingsCard
          formData={formData}
          onChange={handleChange}
        />

        {/* 6. Comportamento em Grupos */}
        <GroupSettingsCard
          formData={formData}
          onChange={handleChange}
          onNavigateToTab={onNavigateToTab}
        />

        {/* 7. Moderação */}
        <ModerationSettingsCard
          formData={formData}
          onChange={handleChange}
        />

        {/* 8. Motivação e Mensagens Automáticas */}
        <MotivationSettingsCard
          formData={formData}
          onChange={handleChange}
          botId={bot.id}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
        />

        {/* 9. Conexão WhatsApp */}
        <WhatsAppSettingsCard
          bot={bot}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
          onUpdateBot={onUpdateBot}
          onNavigateToTab={onNavigateToTab}
        />

        {/* 10. Informações Técnicas */}
        <TechnicalInfoCard
          bot={bot}
          stats={stats}
          isAdminMode={isAdminMode}
        />

        {/* 11. Danger Zone */}
        <DangerZoneCard
          bot={bot}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
          onUpdateBot={onUpdateBot}
          onBotDeleted={onBotDeleted}
        />
      </div>

      {/* Bottom Sticky Action Bar if changes pending */}
      <div className="p-4 rounded-2xl bg-[#0B0E12] border border-[#22282F] flex items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className={`w-2 h-2 rounded-full ${hasChanges ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
          <span>{hasChanges ? 'Modificações não salvas no banco de dados' : 'Todas as configurações estão sincronizadas'}</span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            icon={<Save className="w-4 h-4" />}
            loading={saving}
            onClick={handleSave}
          >
            Guardar Configurações
          </Button>
        </div>
      </div>
    </div>
  );
};
