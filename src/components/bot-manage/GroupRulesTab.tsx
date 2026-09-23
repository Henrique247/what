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
  ShieldCheck,
  Radio,
  Settings2
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

export const GroupRulesTab: React.FC<GroupRulesTabProps> = ({
  bot,
  groups = [],
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
    setGroupList(groups || []);
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
      <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-[#142340] flex items-center justify-between bg-[#081021]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-white">Políticas Globais de Moderação em Grupos</span>
              <p className="text-[10px] text-slate-400">Ações punitivas automáticas e taxas de limitação</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-400/20">
            MOTOR ATIVO
          </span>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Ação Anti-Link */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                <Link2Off className="w-3.5 h-3.5 text-sky-400" />
                AÇÃO AO DETECTAR LINK NÃO AUTORIZADO
              </label>
              <select
                value={globalRules.antiLinkAction}
                onChange={(e) => setGlobalRules({ ...globalRules, antiLinkAction: e.target.value })}
                className="w-full h-10 bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] transition-all"
              >
                <option value="kick">Expulsar Participante Imediatamente (Kick)</option>
                <option value="delete">Apenas Apagar a Mensagem (Delete)</option>
                <option value="warn">Advertir no Chat sem Expulsão (Warn)</option>
              </select>
            </div>

            {/* Taxa Anti-Spam */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5 text-sky-400" />
                LIMITE ANTI-SPAM (MSGS / 10 SEGUNDOS)
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={globalRules.antiSpamRateLimit}
                onChange={(e) => setGlobalRules({ ...globalRules, antiSpamRateLimit: Number(e.target.value) })}
                className="w-full h-10 bg-[#081021] border border-[#1b3259] rounded-xl px-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] transition-all"
              />
            </div>
          </div>

          {/* Template de Boas-Vindas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-sky-400" />
                MENSAGEM DE BOAS-VINDAS AO ENTRAR NO GRUPO
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Tags: {'{user}'}, {'{group}'}</span>
            </div>
            <textarea
              rows={3}
              value={globalRules.welcomeTemplate}
              onChange={(e) => setGlobalRules({ ...globalRules, welcomeTemplate: e.target.value })}
              className="w-full bg-[#081021] border border-[#1b3259] rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-400 focus:shadow-[0_0_12px_rgba(14,165,233,0.25)] resize-y leading-relaxed transition-all"
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
              Salvar Regras Globais
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de Grupos Conectados */}
      <div className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-[#142340] flex items-center justify-between bg-[#081021]">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold text-white">Grupos sob Gestão da Instância</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {groupList.length} GRUPOS IDENTIFICADOS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#142340] bg-[#070e1d] text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                <th className="py-3 px-5 font-normal">Identificação do Grupo</th>
                <th className="py-3 px-5 font-normal">Participantes</th>
                <th className="py-3 px-5 font-normal">Bot Admin</th>
                <th className="py-3 px-5 font-normal text-center">Anti-Link</th>
                <th className="py-3 px-5 font-normal text-center">Anti-Spam</th>
                <th className="py-3 px-5 font-normal text-center">Boas-Vindas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#142340] font-mono text-slate-300">
              {groupList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500 space-y-2">
                      <Users className="w-7 h-7 text-sky-400/30" />
                      <p className="text-xs text-slate-400 font-sans font-medium">Nenhum grupo sincronizado no momento.</p>
                      <p className="text-[11px] text-slate-500 max-w-md font-sans">
                        Quando este bot estiver conectado ao WhatsApp e for adicionado a grupos, eles aparecerão aqui com as opções de controle individual.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                groupList.map((group) => (
                  <tr key={group.id} className="hover:bg-[#0c1833]/70 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-sans font-medium text-white text-xs">{group.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{group.jid}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-slate-300">{group.membersCount}</span>
                    </td>
                    <td className="py-3.5 px-5">
                      {group.isBotAdmin ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-sky-400 font-bold">
                          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                          SIM
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">NÃO</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <input
                        type="checkbox"
                        checked={group.antiLinkEnabled}
                        onChange={(e) => handleToggleGroupField(group.id, 'antiLinkEnabled', e.target.checked)}
                        className="w-4 h-4 accent-sky-500 bg-[#081021] border-[#1b3259] rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <input
                        type="checkbox"
                        checked={group.antiSpamEnabled}
                        onChange={(e) => handleToggleGroupField(group.id, 'antiSpamEnabled', e.target.checked)}
                        className="w-4 h-4 accent-sky-500 bg-[#081021] border-[#1b3259] rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <input
                        type="checkbox"
                        checked={group.welcomeEnabled}
                        onChange={(e) => handleToggleGroupField(group.id, 'welcomeEnabled', e.target.checked)}
                        className="w-4 h-4 accent-sky-500 bg-[#081021] border-[#1b3259] rounded cursor-pointer"
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
