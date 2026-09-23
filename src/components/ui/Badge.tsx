import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'gray' | 'red' | 'amber' | 'blue' | 'cyan';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'cyan',
  dot = false,
  className = ''
}) => {
  const variantStyles = {
    cyan: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    emerald: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    blue: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
    gray: 'bg-slate-800/80 text-slate-400 border-slate-700',
    red: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  };

  const dotColors = {
    cyan: 'bg-sky-400 shadow-[0_0_6px_#38bdf8]',
    emerald: 'bg-sky-400 shadow-[0_0_6px_#38bdf8]',
    blue: 'bg-blue-400 shadow-[0_0_6px_#60a5fa]',
    gray: 'bg-slate-500',
    red: 'bg-rose-400 shadow-[0_0_6px_#f43f5e]',
    amber: 'bg-amber-400 shadow-[0_0_6px_#fbbf24]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold font-mono border ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} shrink-0`} />
      )}
      {children}
    </span>
  );
};
