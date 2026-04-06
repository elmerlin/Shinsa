import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../AvatarPicker';
import { getCountryFlag } from '../../utils/countryFlags';
import { useAuth } from '../../contexts/AuthContext';

const MEDAL_COLORS = ['text-piu-gold', 'text-piu-silver', 'text-piu-bronze'];
const MEDAL_BG = [
  'bg-gradient-to-r from-amber-500/10 to-transparent border-l-2 border-l-amber-500/40',
  'bg-gradient-to-r from-gray-300/8 to-transparent border-l-2 border-l-gray-400/30',
  'bg-gradient-to-r from-orange-600/8 to-transparent border-l-2 border-l-amber-700/30',
];

function LeaderboardRow({ entry, isViewer, medal }) {
  const avatarUrl = getAvatarUrl(entry.avatar, 'sm');

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors ${
        isViewer
          ? 'bg-piu-dark/80 ring-1 ring-piu-gold/30'
          : medal
            ? MEDAL_BG[entry.rank - 1]
            : 'hover:bg-white/[0.03]'
      }`}
    >
      <span className={`w-7 shrink-0 text-center font-display text-sm font-black ${
        medal ? MEDAL_COLORS[entry.rank - 1] : 'text-white/40'
      }`}>
        {medal ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][entry.rank - 1] : entry.rank}
      </span>

      <Link to={`/profile/${entry.user_id}`} className="shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full border border-white/20 object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded-full bg-piu-dark flex items-center justify-center text-xs font-bold text-white/60">
            {(entry.username || '?')[0]}
          </div>
        )}
      </Link>

      <Link
        to={`/profile/${entry.user_id}`}
        className={`min-w-0 flex-1 truncate text-sm font-display font-bold transition-colors ${
          isViewer ? 'text-piu-gold' : 'text-white hover:text-piu-gold'
        }`}
      >
        {entry.nationality && (
          <>{getCountryFlag(entry.nationality, 'h-[13px] inline-block mr-1')} </>
        )}
        {entry.username}
      </Link>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-display font-bold text-white/80 tabular-nums">
          {(entry.points || 0).toLocaleString()}
        </span>
        <span className="text-xs font-display text-white/35 tabular-nums w-7 text-right">
          {entry.clears || 0}
        </span>
      </div>
    </div>
  );
}

export default function WeeklyChallengeLeaderboard({ leaderboard = [], maxRows = 20 }) {
  const { user } = useAuth();

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <p className="text-center text-zinc-500 text-sm py-8">No participants yet this week</p>
    );
  }

  const displayRows = leaderboard.slice(0, maxRows);
  const viewerInTop = user ? displayRows.some(e => e.user_id === user.id) : false;
  const viewerEntry = !viewerInTop && user
    ? leaderboard.find(e => e.user_id === user.id)
    : null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      {/* Column headers */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-white/[0.04]">
        <span className="w-7 shrink-0 text-center text-[10px] font-display font-bold text-white/20 uppercase tracking-wider">#</span>
        <span className="w-7 shrink-0" />
        <span className="flex-1 text-[10px] font-display font-bold text-white/20 uppercase tracking-wider">Player</span>
        <span className="text-[10px] font-display font-bold text-white/20 uppercase tracking-wider">Points</span>
        <span className="text-[10px] font-display font-bold text-white/20 uppercase tracking-wider w-7 text-right">Clr</span>
      </div>

      <div className="divide-y divide-white/[0.03]">
        {displayRows.map((entry) => (
          <LeaderboardRow
            key={entry.user_id}
            entry={entry}
            isViewer={user && entry.user_id === user.id}
            medal={entry.rank <= 3}
          />
        ))}

        {viewerEntry && (
          <>
            <div className="flex items-center justify-center py-1">
              <span className="text-white/15 text-xs tracking-widest">···</span>
            </div>
            <LeaderboardRow entry={viewerEntry} isViewer medal={false} />
          </>
        )}
      </div>
    </div>
  );
}
