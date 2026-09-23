import React, { useState } from 'react';
import { Bot } from '../../types';
import { Button } from '../ui/Button';
import { 
  Users, 
  ShieldAlert, 
  Link2Off, 
  UserPlus, 
  Ban, 
  Save, 
  ShieldCheck
} from 'lucide-react';

export interface GroupConfig {
  id: string;
  jid: string;
  name: string;
  membersCount: number;
  isBotAdmin: boolean;
  antiLinkEnabled: boolean;
  antiSpamEnabled: boolean;
  welcomeEnabled: boolean;
}

interface GroupRulesTabProps {
  bot: Bot;
  groups?: GroupConfig[];
  onSaveGlobalRules?: (rules: any) => Promise<void>;
  onUpdateGroupConfig?: (groupId: string, config: Partial<GroupConfig>) => Promise<void>;
}

const MOCK_GROUPS: GroupConfig[] = [
  {
    id: 'grp-1',
    jid: '120363048123456789@g.us',
    name: 'Comunidade TECHSTAR - Oficial',
    membersCount: 482,
    isBotAdmin: true,
    antiLinkEnabled: true,
    antiSpamEnabled: true,
    welcomeEnabled: true,
  },
  {
    id: 'grp-2',
    jid: '120363098765432100@g.us',
    name: 'Networking IT & Suporte Técnico',
    membersCount: 215,
    isBotAdmin: false,
    antiLinkEnabled: false,
    antiSpamEnabled: true,
    welcomeEnabled: false,
  }
];

export const GroupRulesTab: React.FC<GroupRulesTabProps> = ({
  bot,
  groups = MOCK_GROUPS,
  onSaveGlobalRules,
  onUpdateGroupConfig
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [groupList, setGroupList] = useState<GroupConfig[]>(groups);
  const [globalRules, setGlobalRules] = useState({
    antiLinkAction: bot.moderationAction || 'kick', // 'kick' | 'delete' | 'warn'
    antiSpamRateLimit: bot.antiSpamMaxMessages || 5, // mensagens por 10 segundos
    welcomeTemplate: bot.groupWelcomeMsg || 'Olá {user}, bem-vindo(a) ao grupo {group}!\nPor favor, respeite as regras de convivência.',
  });

  // Sync groups if prop changes
  React.useEffect(() => {
    if (groups && groups.length > 0) {
      setGroupList(groups);
    }
  }, [groups]);

  const handleSaveGlobal = async () => {
    setIsSaving(true);
    try {
      if (onSaveGlobalRules) await onSaveGlobalRules(globalRules);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleGroupField = async (groupId: string, field: keyof GroupConfig, value: boolean) => {
    setGroupList(prev => prev.map(g => g.id === groupId ? { ...g, [field]: value } : g));
    if (onUpdateGroupConfig) {
      await onUpdateGroupConfig(groupId, { [field]: value });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl select-none">
      {/* Painel de Políticas Globais de Moderação */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#059669]" />
            <span className="text-xs font-semibold text-[#ECEED0]">Políticas Globais de Moderação em Grupos</span>
          </div>
        </div>

        <div className="p-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Regra Anti-Link */}
            <div className="space-y-3 bg-[#090A0C] p-3.5 border border-[#1E2228] rounded-[4px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2Off className="w-4 h-4 text-[#F59E0B]" />
                  <span className="text-xs font-medium text-[#ECEED0]">Ação do Filtro Anti-Link</span>
                </div>
              </div>
              <p className="text-[11px] text-[#626B79]">
                Define a resposta automática do bot ao detetar links de convite de outros grupos ou websites não autorizados.
              </p>
              <select
                value={globalRules.antiLinkAction}
                onChange={(e) => setGlobalRules({ ...globalRules, antiLinkAction: e.target.value })}
                className="w-full h-8 bg-[#101216] border border-[#2A2F37] rounded-[4px] px-2.5 text-xs font-mono text-[#ECEED0] focus:outline-none focus:border-[#3A414D]"
              >
                <option value="kick">Remover Membro + Apagar Mensagem (Requer Admin)</option>
                <option value="delete">Apenas Apagar Mensagem (Requer Admin)</option>
                <option value="warn">Emitir Aviso Público no Grupo</option>
              </select>
            </div>

            {/* Regra Anti-Spam / Flood */}
            <div className="space-y-3 bg-[#090A0C] p-3.5 border border-[#1E2228] rounded-[4px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-[#EF4444]" />
                  <span className="text-xs font-medium text-[#ECEED0]">Limite Anti-Flood (Mensagens/10s)</span>
                </div>
                <span className="text-xs font-mono text-[#10B981] font-semibold">{globalRules.antiSpamRateLimit} msg</span>
              </div>
              <p className="text-[11px] text-[#626B79]">
                Bloqueia membros que excedam a taxa limite de mensagens consecutivas num intervalo de 10 segundos.
              </p>
              <input
                type="range"
                min="3"
                max="15"
                step="1"
                value={globalRules.antiSpamRateLimit}
                onChange={(e) => setGlobalRules({ ...globalRules, antiSpamRateLimit: Number(e.target.value) })}
                className="w-full accent-[#059669] h-1.5 bg-[#1E2228] rounded-[2px] appearance-none outline-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#626B79] font-mono">
                <span>3 msg (Estrito)</span>
                <span>15 msg (Tolerante)</span>
              </div>
            </div>
          </div>

          {/* Template da Mensagem de Boas-Vindas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-[#626B79] uppercase flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-[#10B981]" />
                Template de Boas-Vindas (Novo Membro)
              </label>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#626B79]">
                <span>VARIÁVEIS:</span>
                <code className="bg-[#16191E] text-[#ECEED0] px-1 py-0.5 rounded-[2px] border border-[#2A2F37]">{'{user}'}</code>
                <code className="bg-[#16191E] text-[#ECEED0] px-1 py-0.5 rounded-[2px] border border-[#2A2F37]">{'{group}'}</code>
              </div>
            </div>
            <textarea
              value={globalRules.welcomeTemplate}
              onChange={(e) => setGlobalRules({ ...globalRules, welcomeTemplate: e.target.value })}
              className="w-full h-24 bg-[#090A0C] border border-[#2A2F37] rounded-[4px] p-3 text-[11px] font-mono text-[#ECEED0] placeholder-[#626B79] focus:outline-none focus:border-[#3A414D] resize-y leading-relaxed"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              variant="primary"
              icon={<Save className="w-3.5 h-3.5" />}
              loading={isSaving}
              onClick={handleSaveGlobal}
            >
              Gravar Regras Globais
            </Button>
          </div>
        </div>
      </div>

      {/* Lista de Grupos Monitorados */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#626B79]" />
            <span className="text-xs font-semibold text-[#ECEED0]">Grupos Ativos e Permissões do Bot</span>
          </div>
          <span className="text-[11px] font-mono text-[#626B79]">{groupList.length} GRUPOS DETETADOS</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1E2228] bg-[#090A0C] text-[#626B79] font-mono text-[11px] uppercase">
                <th className="py-2.5 px-4 font-normal">Identificação do Grupo</th>
                <th className="py-2.5 px-4 font-normal">Membros</th>
                <th className="py-2.5 px-4 font-normal">Estatuto de Admin</th>
                <th className="py-2.5 px-4 font-normal">Anti-Link</th>
                <th className="py-2.5 px-4 font-normal">Anti-Spam</th>
                <th className="py-2.5 px-4 font-normal">Boas-Vindas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2228] font-mono text-[#9DA4B0]">
              {groupList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#626B79]">
                    A instância ainda não está inserida em nenhum grupo do WhatsApp.
                  </td>
                </tr>
              ) : (
                groupList.map((group) => (
                  <tr key={group.id} className="hover:bg-[#16191E] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-sans font-medium text-[#ECEED0] text-xs">{group.name}</div>
                      <div className="text-[10px] text-[#626B79] font-mono mt-0.5">{group.jid}</div>
                    </td>
                    <td className="py-3 px-4 text-[#ECEED0]">
                      {group.membersCount} participantes
                    </td>
                    <td className="py-3 px-4">
                      {group.isBotAdmin ? (
                        <span className="badge-status bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                          <ShieldCheck className="w-3 h-3 text-[#10B981]" /> ADMIN
                        </span>
                      ) : (
                        <span className="badge-status bg-[#6B7280]/10 text-[#9DA4B0] border border-[#6B7280]/20">
                          MEMBRO COMUM
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={group.antiLinkEnabled}
                        onChange={(e) => handleToggleGroupField(group.id, 'antiLinkEnabled', e.target.checked)}
                        className="w-4 h-4 accent-[#059669] bg-[#090A0C] border-[#2A2F37] rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={group.antiSpamEnabled}
                        onChange={(e) => handleToggleGroupField(group.id, 'antiSpamEnabled', e.target.checked)}
                        className="w-4 h-4 accent-[#059669] bg-[#090A0C] border-[#2A2F37] rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={group.welcomeEnabled}
                        onChange={(e) => handleToggleGroupField(group.id, 'welcomeEnabled', e.target.checked)}
                        className="w-4 h-4 accent-[#059669] bg-[#090A0C] border-[#2A2F37] rounded cursor-pointer"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
