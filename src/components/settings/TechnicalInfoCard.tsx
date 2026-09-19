import React from 'react';
import { Info, Layers, Server, Shield, Database, Users, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Bot, BotStats } from '../../types';

interface TechnicalInfoCardProps {
  bot: Bot;
  stats?: BotStats | null;
  isAdminMode?: boolean;
}

export const TechnicalInfoCard: React.FC<TechnicalInfoCardProps> = ({
  bot,
  stats,
  isAdminMode = false,
}) => {
  return (
    <div id="settings-info" className="techstar-card p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#22282F]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
              Informações Técnicas do Bot
            </h2>
            <p className="text-xs text-zinc-400">Metadados operacionais e parâmetros da infraestrutura</p>
          </div>
        </div>

        <span className="text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded bg-[#101418] border border-[#22282F]">
          v2.4.0 SaaS
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
        {/* Bot ID */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F] col-span-2 sm:col-span-1">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-emerald-400" />
            <span>ID da Instância</span>
          </span>
          <p className="font-mono text-zinc-200 mt-1 truncate font-medium">{bot.id}</p>
        </div>

        {/* Plano */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F]">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span>Plano Comercial</span>
          </span>
          <p className="text-emerald-400 font-bold mt-1 uppercase">{bot.plan || 'PRO'}</p>
        </div>

        {/* Grupos Vinculados */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F]">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <Users className="w-3 h-3 text-emerald-400" />
            <span>Grupos Sincronizados</span>
          </span>
          <p className="text-zinc-200 font-semibold mt-1">
            {stats?.groupCount ?? 'Sincronizado'}
          </p>
        </div>

        {/* Grupos Admin */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F]">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Como Administrador</span>
          </span>
          <p className="text-emerald-400 font-semibold mt-1">
            {stats?.adminGroupCount ? `${stats.adminGroupCount} grupos` : 'Ativo'}
          </p>
        </div>

        {/* Armazenamento */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F]">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-400" />
            <span>Persistência</span>
          </span>
          <p className="text-zinc-300 font-medium mt-1">Google Firestore</p>
        </div>

        {/* Motor Baileys */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F]">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <Server className="w-3 h-3 text-emerald-400" />
            <span>Conector WhatsApp</span>
          </span>
          <p className="text-zinc-300 font-medium mt-1">Baileys Multi-Device</p>
        </div>

        {/* Isolamento Multitenant */}
        <div className="p-3 rounded-xl bg-[#0B0E12] border border-[#22282F] col-span-2">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Segurança Multitenant</span>
          </span>
          <p className="text-zinc-400 font-medium mt-1 text-[11px] leading-snug">
            Isolamento estrito de dados por ID de instância com validação de permissões RBAC no backend.
          </p>
        </div>
      </div>
    </div>
  );
};
