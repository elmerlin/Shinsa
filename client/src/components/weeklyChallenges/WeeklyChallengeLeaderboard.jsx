import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../AvatarPicker';
import { getCountryFlag } from '../PlayerRegistration';
import { useAuth } from '../../contexts/AuthContext';

const MEDAL_COLORS = ['text-piu-gold', 'text-piu-silver', 'text-piu-bronze'];
const MEDAL_BG = [
  'bg-gradient-to-r from-amber-500/10 to-transparent border-l-2 border-l-amber-500/40',
  'bg-gradient-to-r from-gray-300/8 to-transparent border-l-2 border-l-gray-400/30',
  'bg-gradient-to-r from-orange-600/8 to-transparent border-l-2 border-l-amber-700/30',
];

export default function WeeklyChallengeLeaderboard({ leaderboard = [], maxRows = 20 }) {
  const { user } = useAuth();

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <p className="text-center text-gray-500 text-[11px] py-6">No participants yet this week</p>
    );
  }

  const displayRows = leaderboard.slice(0, maxRows);
  const viewerInTop = user ? displayRows.some(e => e.user_id === user.id) : false;
  const viewerEntry = !viewerInTop && user
    ? leaderboard.find(e => e.user_id === user.id)
    : null;

  return (
    <div className="space-y-0.5">
      {displayRows.map((entry, i) => {
        const isViewer = user && entry.user_id === user.id;
        const avatarUrl = getAvatarUrl(entry.avatar, 'sm');
        const medal = entry.rank <= 3;

        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors ${
              isViewer
                ? 'bg-piu-dark/80 ring-1 ring-piu-gold/30'
                : medal
                  ? MEDAL_BG[entry.rank - 1]
                  : 'hover:bg-white/[0.03]'
            }`}
          >
            <span className={`w-6 shrink-0 text-center font-display text-[11px] font-black ${
              medal ? MEDAL_COLORS[entry.rank - 1] : 'text-white/40'
            }`}>
              {medal ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
            </span>

            {avatarUrl && (
              <img src={avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full border border-white/20 object-cover" />
            )}

            <Link
              to={`/profile/${entry.user_id}`}
              className="min-w-0 flex-1 truncate text-[11px] font-display font-bold text-white hover:text-piu-gold transition-colors"
            >
              {entry.nationality && (
                <>{getCountryFlag(entry.nationality, 'h-[11px] inline-block mr-0.5')} </>
              )}
              {entry.username}
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-display font-bold text-white/70 tabular-nums">
                {(entry.points || 0).toLocaleString()}<span className="text-white/30 ml-0.5 text-[8px]">pts</span>
              </span>
              <span className="text-[9px] font-display text-white/40 tabular-nums">
                {entry.clears || 0}<span className="ml-0.5">clr</span>
              </span>
            </div>
          </div>
        );
      })}

      {viewerEntry && (
        <>
          <div className="flex items-center gap-2 px-2.5 py-0.5">
            <span className="text-white/20 text-[10px]">···</span>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-piu-dark/80 ring-1 ring-piu-gold/30">
            <span className="w-6 shrink-0 text-center font-display text-[11px] font-black text-white/40">
              {viewerEntry.rank}
            </span>
            {getAvatarUrl(viewerEntry.avatar, 'sm') && (
              <img src={getAvatarUrl(viewerEntry.avatar, 'sm')} alt="" className="h-5 w-5 shrink-0 rounded-full border border-white/20 object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] font-display font-bold text-piu-gold">
              {viewerEntry.nationality && (
                <>{getCountryFlag(viewerEntry.nationality, 'h-[11px] inline-block mr-0.5')} </>
              )}
              {viewerEntry.username}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-display font-bold text-white/70 tabular-nums">
                {(viewerEntry.points || 0).toLocaleString()}<span className="text-white/30 ml-0.5 text-[8px]">pts</span>
              </span>
              <span className="text-[9px] font-display text-white/40 tabular-nums">
                {viewerEntry.clears || 0}<span className="ml-0.5">clr</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
