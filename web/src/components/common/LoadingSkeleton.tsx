import React from "react";

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 3, className = "" }) => {
  return (
    <div className={`space-y-4 animate-pulse ${className}`} role="status" aria-label="Loading content">
      <div className="h-6 w-1/3 bg-slate-200 rounded"></div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="h-4 bg-slate-200 rounded w-full"></div>
        ))}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
};
