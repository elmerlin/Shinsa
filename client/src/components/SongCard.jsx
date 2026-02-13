import React, { useState } from 'react';

const MODE_COLORS = {
  Single: { bg: 'bg-red-600', gradient: 'from-red-700 to-red-900', badge: 'bg-red-500/30 text-red-300 border border-red-500/40', label: 'S' },
  Double: { bg: 'bg-green-600', gradient: 'from-green-700 to-green-900', badge: 'bg-green-500/30 text-green-300 border border-green-500/40', label: 'D' },
};

export default function SongCard({ song, index, isVetoed, vetoInfo, player1, player2, canVeto, onVeto, showAnimation }) {
  const colors = MODE_COLORS[song.mode] || MODE_COLORS.Single;
  const [imgError, setImgError] = useState(false);

  const vetoedByName = vetoInfo
    ? (vetoInfo.player_id === player1?.id ? player1?.name : player2?.name)
    : null;

  return (
    <div
      onClick={canVeto ? onVeto : undefined}
      className={`relative overflow-hidden rounded-lg sm:rounded-xl border sm:border-2 transition-all duration-300
        ${showAnimation ? 'animate-card-flip' : 'opacity-0'}
        ${isVetoed
          ? 'border-red-900/30 opacity-40 grayscale'
          : canVeto
            ? 'border-piu-border hover:border-white cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-white/10'
            : song.mode === 'Single' ? 'border-red-500/40' : 'border-green-500/40'
        }
      `}
      style={{ animationDelay: `${index * 0.1}s`, animationFillMode: 'backwards' }}
    >
      {/* Card background - red for Single, green for Double */}
      <div className={`absolute inset-0 bg-gradient-to-b ${colors.gradient} opacity-30`} />

      <div className="relative p-1.5 sm:p-3">
        {/* Level badge */}
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <span className={`text-[10px] sm:text-xs font-display font-bold px-1 sm:px-2 py-0.5 rounded ${colors.badge}`}>
            {colors.label}{song.level}
          </span>
          {song.bpm && (
            <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:inline">{song.bpm} BPM</span>
          )}
        </div>

        {/* Song jacket */}
        <div className={`w-full aspect-square rounded sm:rounded-lg overflow-hidden mb-1 sm:mb-2 ${colors.bg} flex items-center justify-center`}>
          {song.jacket_url && !imgError ? (
            <img
              src={song.jacket_url}
              alt={song.title}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="text-center p-1 sm:p-2">
              <div className="text-xl sm:text-3xl font-display font-bold opacity-40">
                {song.title.charAt(0)}
              </div>
              <div className="text-[10px] sm:text-xs mt-0.5 opacity-40 font-display">
                {song.mode}
              </div>
            </div>
          )}
        </div>

        {/* Song info */}
        <div className="min-h-[24px] sm:min-h-[40px]">
          <p className="font-display font-bold text-[10px] sm:text-sm leading-tight truncate" title={song.title}>
            {song.title}
          </p>
          <p className="text-[9px] sm:text-xs text-gray-400 truncate">{song.artist}</p>
        </div>

        {/* Mode indicator bar at bottom */}
        <div className={`mt-1 sm:mt-2 h-0.5 sm:h-1 rounded-full ${song.mode === 'Single' ? 'bg-red-500' : 'bg-green-500'}`} />

        {/* Vetoed overlay */}
        {isVetoed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg sm:rounded-xl">
            <div className="text-center">
              <div className="text-2xl sm:text-4xl text-red-500 font-bold">&#10005;</div>
              <p className="text-[9px] sm:text-xs text-red-400 font-display mt-0.5 sm:mt-1 px-1">
                {vetoedByName}
              </p>
            </div>
          </div>
        )}

        {/* Veto hover/tap hint */}
        {canVeto && !isVetoed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/50 active:bg-black/50 rounded-lg sm:rounded-xl transition-colors group">
            <span className="opacity-0 group-hover:opacity-100 group-active:opacity-100 font-display font-bold text-white text-xs sm:text-sm transition-opacity bg-red-600 px-2 sm:px-3 py-0.5 sm:py-1 rounded">
              BAN
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
