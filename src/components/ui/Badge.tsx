import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'gray' | 'red' | 'amber' | 'blue';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'emerald',
  dot = false,
  className = ''
}) => {
  const variantStyles = {
    emerald: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',
    gray: 'bg-[#16191E] text-[#9DA4B0] border-[#2A2F37]',
    red: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
    amber: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
    blue: 'bg-[#3B82F6]/10 text-[#60A5FA] border-[#3B82F6]/20',
  };

  const dotColors = {
    emerald: 'bg-[#10B981]',
    gray: 'bg-[#6B7280]',
    red: 'bg-[#EF4444]',
    amber: 'bg-[#F59E0B]',
    blue: 'bg-[#60A5FA]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-medium font-mono border ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-[2px] ${dotColors[variant]} shrink-0`} />
      )}
      {children}
    </span>
  );
};
