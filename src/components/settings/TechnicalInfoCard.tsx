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
    <div id="settings-info" className="bg-[#0b1426]/90 backdrop-blur-md rounded-2xl border border-[#162a4d] p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Informações Técnicas do Bot
            </h2>
            <p className="text-xs text-slate-400">Metadados operacionais e parâmetros da infraestrutura</p>
          </div>
        </div>

        <span className="text-[10px] text-sky-300 font-mono px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-400/20">
          v2.4.0 SaaS
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
        {/* Bot ID */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d] col-span-2 sm:col-span-1">
          <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-sky-400" />
            <span>ID da Instância</span>
          </span>
          <p className="font-mono text-white mt-1 truncate font-medium">{bot.id}</p>
        </div>

        {/* Plano */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-sky-400" />
            <span>Plano Comercial</span>
          </span>
          <p className="text-sky-400 font-bold mt-1 uppercase font-mono">{bot.plan || 'PRO'}</p>
        </div>

        {/* Grupos Vinculados */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1.5">
            <Users className="w-3 h-3 text-sky-400" />
            <span>Grupos Sincronizados</span>
          </span>
          <p className="text-white font-semibold mt-1 font-mono">
            {stats?.groupCount ?? 'Sincronizado'}
          </p>
        </div>

        {/* Grupos Admin */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-sky-400" />
            <span>Como Administrador</span>
          </span>
          <p className="text-white font-semibold mt-1 font-mono">
            {stats?.adminGroupCount ?? 'Verificado'}
          </p>
        </div>

        {/* Modelo IA */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Motor IA</span>
          <p className="font-mono text-white mt-1 truncate font-medium">
            {bot.aiModel || 'gemini-1.5-flash'}
          </p>
        </div>

        {/* Baileys Session */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Motor WhatsApp</span>
          <p className="font-mono text-sky-300 mt-1 truncate font-medium">
            Baileys Multi-Device
          </p>
        </div>

        {/* Firestore Persistence */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Banco de Dados</span>
          <p className="font-mono text-white mt-1 truncate font-medium">
            Google Firestore
          </p>
        </div>

        {/* Multi-Tenant Isolation */}
        <div className="p-3.5 rounded-xl bg-[#081021] border border-[#162a4d]">
          <span className="text-[10px] text-slate-500 uppercase font-semibold">Isolamento</span>
          <p className="font-mono text-sky-400 mt-1 truncate font-medium">
            SaaS Rígido
          </p>
        </div>
      </div>
    </div>
  );
};
