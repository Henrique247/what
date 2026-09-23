import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  disabled,
  className = '',
  ...props
}) => {
  const baseClasses = "inline-flex items-center justify-center font-medium transition-all focus:outline-none rounded-xl text-xs disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

  const sizeClasses = {
    sm: "h-8 px-3 gap-1.5",
    md: "h-9 px-4 gap-2",
    lg: "h-10 px-5 gap-2 text-sm"
  };

  const variantClasses = {
    primary: "bg-sky-500 hover:bg-sky-400 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)] border border-sky-400/50",
    secondary: "bg-[#0c1830] hover:bg-[#122347] text-slate-200 hover:text-white border border-[#1e355e]",
    danger: "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30",
    ghost: "bg-transparent hover:bg-sky-500/10 text-slate-400 hover:text-sky-300 border border-transparent",
    outline: "bg-transparent hover:bg-[#0c1830] text-slate-300 hover:text-white border border-[#1e355e]"
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size] || sizeClasses.md} ${variantClasses[variant] || variantClasses.secondary} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};
