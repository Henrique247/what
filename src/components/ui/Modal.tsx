import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md'
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#02050d]/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog with Cyber Blue styling */}
      <div className={`relative w-full ${maxWidthStyles[maxWidth]} bg-[#091326] border border-[#1b3259] rounded-2xl shadow-[0_0_50px_rgba(14,165,233,0.18)] p-6 z-10 animate-in zoom-in-95 duration-200`}>
        <div className="flex items-start justify-between pb-4 border-b border-[#142340]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
              <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">{title}</h3>
            </div>
            {description && (
              <p className="text-xs text-slate-400 mt-1">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#0f1f3d] transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
};
