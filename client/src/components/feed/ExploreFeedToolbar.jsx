import React from 'react';

export default function ExploreFeedToolbar({ scope, onScopeChange }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">
      <button
        type="button"
        onClick={() => onScopeChange('following')}
        className={`px-3.5 py-1.5 rounded-md text-xs font-display font-bold tracking-wide transition-all duration-200 ${
          scope === 'following'
            ? 'bg-piu-accent/15 text-piu-accent border border-piu-accent/25 shadow-[0_0_8px_rgba(255,51,102,0.1)]'
            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
        }`}
      >
        Following
      </button>
      <button
        type="button"
        onClick={() => onScopeChange('global')}
        className={`px-3.5 py-1.5 rounded-md text-xs font-display font-bold tracking-wide transition-all duration-200 ${
          scope === 'global'
            ? 'bg-piu-blue/15 text-piu-blue border border-piu-blue/25 shadow-[0_0_8px_rgba(68,136,255,0.1)]'
            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
        }`}
      >
        Global
      </button>
      <button
        type="button"
        onClick={() => onScopeChange('me')}
        className={`px-3.5 py-1.5 rounded-md text-xs font-display font-bold tracking-wide transition-all duration-200 ${
          scope === 'me'
            ? 'bg-piu-green/15 text-piu-green border border-piu-green/25 shadow-[0_0_8px_rgba(51,255,102,0.1)]'
            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
        }`}
      >
        Me
      </button>
    </div>
  );
}
