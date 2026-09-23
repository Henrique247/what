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
  const baseClasses = "inline-flex items-center justify-center font-medium transition-colors focus:outline-none rounded-[4px] text-xs disabled:opacity-50 disabled:cursor-not-allowed select-none";

  const sizeClasses = {
    sm: "h-8 px-2.5 gap-1.5",
    md: "h-9 px-3.5 gap-2",
    lg: "h-10 px-4 gap-2 text-sm"
  };

  const variantClasses = {
    primary: "bg-[#059669] hover:bg-[#047857] text-white border border-[#059669]",
    secondary: "bg-[#16191E] hover:bg-[#1D2128] text-[#ECEED01] border border-[#2A2F37]",
    danger: "bg-[#7F1D1D]/20 hover:bg-[#7F1D1D]/40 text-[#EF4444] border border-[#7F1D1D]/50",
    ghost: "bg-transparent hover:bg-[#16191E] text-[#9DA4B0] hover:text-white border border-transparent",
    outline: "bg-transparent hover:bg-[#16191E] text-[#9DA4B0] hover:text-white border border-[#2A2F37]"
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
