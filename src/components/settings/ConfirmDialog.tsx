import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={loading ? undefined : onClose}
      />

      {/* Dialog box */}
      <div className="relative w-full max-w-md bg-[#101418] border border-[#22282F] rounded-2xl shadow-2xl p-6 z-10 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            variant === 'danger'
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
              : variant === 'warning'
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
              : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{description}</p>
          </div>

          {!loading && (
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors -mr-1 -mt-1 p-1 rounded-lg hover:bg-[#151A1F]"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-[#22282F]">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
