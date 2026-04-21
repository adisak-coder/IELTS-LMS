import React from 'react';

interface SectionLoadingSkeletonProps {
  message?: string | undefined;
}

export function SectionLoadingSkeleton({ message }: SectionLoadingSkeletonProps) {
  return (
    <div className="p-6">
      <div className="max-w-3xl space-y-4">
        {message ? <p className="text-xs font-medium text-gray-500">{message}</p> : null}
        <div className="h-6 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-5/6 bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

