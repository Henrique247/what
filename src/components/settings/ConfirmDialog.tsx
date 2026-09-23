import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  description,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  loading = false,
}) => {
  if (!isOpen) return null;

  const handleClose = () => {
    if (loading) return;
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  const displayText = description || message || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#030712]/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={handleClose}
      />

      {/* Dialog box */}
      <div className="relative w-full max-w-md bg-[#0b1426] border border-[#162a4d] rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] p-6 z-10 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            variant === 'danger'
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
              : variant === 'warning'
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
              : 'bg-sky-500/15 border border-sky-400/30 text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.2)]'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{displayText}</p>
          </div>

          {!loading && (
            <button
              onClick={handleClose}
              className="text-slate-500 hover:text-white transition-colors -mr-1 -mt-1 p-1 rounded-lg hover:bg-[#142340]"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#142340]">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
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
