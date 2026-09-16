import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`animate-pulse rounded-lg bg-[#151A1F] border border-[#22282F]/60 ${className}`} />
  );
};

export const StatCardSkeleton: React.FC = () => {
  return (
    <div className="p-5 rounded-xl bg-[#101418] border border-[#22282F] space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
};
