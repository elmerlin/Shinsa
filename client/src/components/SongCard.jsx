import React from 'react';

const MODE_COLORS = {
  Single: { bg: 'from-piu-accent to-pink-700', badge: 'bg-piu-accent/30 text-piu-accent' },
  Double: { bg: 'from-blue-500 to-indigo-700', badge: 'bg-blue-500/30 text-blue-400' },
};

export default function SongCard({ song, index, isVetoed, vetoInfo, player1, player2, canVeto, onVeto, showAnimation }) {
  const colors = MODE_COLORS[song.mode] || MODE_COLORS.Single;

  const vetoedByName = vetoInfo
    ? (vetoInfo.player_id === player1?.id ? player1?.name : player2?.name)
    : null;

  return (
    <div
      onClick={canVeto ? onVeto : undefined}
      className={`relative overflow-hidden rounded-xl border transition-all duration-300
        ${showAnimation ? 'animate-card-flip' : 'opacity-0'}
        ${isVetoed
          ? 'border-red-900/30 opacity-40 grayscale'
          : canVeto
            ? 'border-piu-border hover:border-piu-accent cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-piu-accent/20'
            : 'border-piu-border'
        }
      `}
      style={{ animationDelay: `${index * 0.1}s`, animationFillMode: 'backwards' }}
    >
      {/* Card background gradient */}
      <div className={`bg-gradient-to-b ${colors.bg} opacity-10 absolute inset-0`} />

      <div className="relative p-3">
        {/* Level badge */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-display font-bold px-2 py-0.5 rounded ${colors.badge}`}>
            {song.mode[0]}{song.level}
          </span>
          {song.bpm && (
            <span className="text-xs text-gray-600">{song.bpm} BPM</span>
          )}
        </div>

        {/* Song jacket placeholder */}
        <div className={`w-full aspect-square rounded-lg bg-gradient-to-br ${colors.bg} mb-2 flex items-center justify-center`}>
          {song.jacket_url ? (
            <img src={song.jacket_url} alt={song.title} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <div className="text-center p-2">
              <div className="text-3xl font-display font-bold opacity-30">
                {song.title.charAt(0)}
              </div>
            </div>
          )}
        </div>

        {/* Song info */}
        <div className="min-h-[40px]">
          <p className="font-display font-bold text-sm leading-tight truncate" title={song.title}>
            {song.title}
          </p>
          <p className="text-xs text-gray-500 truncate">{song.artist}</p>
        </div>

        {/* Vetoed overlay */}
        {isVetoed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
            <div className="text-center">
              <div className="text-3xl text-red-500 font-bold">&#10005;</div>
              <p className="text-xs text-red-400 font-display mt-1">
                Vetoed by {vetoedByName}
              </p>
            </div>
          </div>
        )}

        {/* Veto hover hint */}
        {canVeto && !isVetoed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 rounded-xl transition-colors group">
            <span className="opacity-0 group-hover:opacity-100 font-display font-bold text-piu-accent text-sm transition-opacity">
              Click to Veto
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
