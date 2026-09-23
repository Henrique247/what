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
    <div className="space-y-6">
      {/* Quick Section Anchor Navigation Bar */}
      <div className="flex items-center gap-1.5 p-2 rounded-2xl bg-[#0b1426]/90 border border-[#162a4d] overflow-x-auto scrollbar-none sticky top-16 z-20 backdrop-blur-md shadow-lg">
        <span className="text-[10px] text-slate-400 font-semibold uppercase px-2 whitespace-nowrap">
          Navegação:
        </span>
        {SECTION_LINKS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => scrollToSection(sec.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-[#0f1d38] transition-colors whitespace-nowrap"
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
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-300">
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
        />

        {/* 4. Inteligência Artificial (Gemini) */}
        <AISettingsCard
          formData={formData}
          onChange={handleChange}
          botId={bot.id}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
        />

        {/* 5. Conversas Privadas */}
        <PrivateSettingsCard
          formData={formData}
          onChange={handleChange}
        />

        {/* 6. Regras de Grupos */}
        <GroupSettingsCard
          formData={formData}
          onChange={handleChange}
        />

        {/* 7. Moderação e Segurança de Conteúdo */}
        <ModerationSettingsCard
          formData={formData}
          onChange={handleChange}
        />

        {/* 8. Motivação e Rotinas Diárias */}
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
          onNavigateToTab={onNavigateToTab}
        />

        {/* 10. Informações Técnicas */}
        <TechnicalInfoCard
          bot={bot}
          stats={stats}
        />

        {/* 11. Zona de Perigo */}
        <DangerZoneCard
          botId={bot.id}
          botName={bot.name}
          clientToken={clientToken}
          isAdminMode={isAdminMode}
          onBotDeleted={onBotDeleted}
        />
      </div>
    </div>
  );
};
