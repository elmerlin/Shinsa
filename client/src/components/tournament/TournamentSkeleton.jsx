import React from 'react';

function SkeletonBlock({ className = '' }) {
  return <div className={`bg-piu-dark animate-pulse rounded-lg ${className}`} />;
}

export default function TournamentSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex gap-3">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 w-16" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 mb-6 border-b border-piu-border pb-2">
        <SkeletonBlock className="h-6 w-20" />
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock className="h-6 w-16" />
      </div>

      {/* Match cards skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="card flex items-center gap-4 p-4">
            <SkeletonBlock className="h-5 w-24 flex-1" />
            <SkeletonBlock className="h-6 w-16" />
            <SkeletonBlock className="h-5 w-24 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
