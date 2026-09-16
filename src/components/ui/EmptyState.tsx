import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-[#101418] border border-[#22282F] ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-[#151A1F] border border-[#22282F] flex items-center justify-center text-zinc-400 mb-3.5">
        {icon}
      </div>
      <h4 className="text-base font-medium text-zinc-200">{title}</h4>
      <p className="text-xs text-zinc-400 mt-1 max-w-sm leading-relaxed mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
