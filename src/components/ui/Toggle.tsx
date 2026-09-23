import React from 'react';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false
}) => {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-[#0b1426]/90 border border-[#162a4d] hover:border-sky-500/30 transition-all">
      <div className="space-y-0.5">
        <label 
          onClick={() => !disabled && onChange(!checked)}
          className="text-xs sm:text-sm font-medium text-slate-200 cursor-pointer select-none hover:text-white transition-colors"
        >
          {label}
        </label>
        {description && (
          <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed max-w-md">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-all duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          checked 
            ? 'bg-gradient-to-r from-sky-500 to-blue-600 border-sky-400/50 shadow-[0_0_12px_rgba(14,165,233,0.5)]' 
            : 'bg-[#081021] border-[#1b3259]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out mt-[1px] ml-[1px] ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
