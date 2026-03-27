import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../AvatarPicker';
import { getCountryFlag } from '../PlayerRegistration';

const PODIUM_COLORS = [
  { bg: 'from-amber-500/20 via-yellow-600/10 to-transparent', border: 'border-amber-500/40', icon: 'text-piu-gold', label: '1st' },
  { bg: 'from-gray-300/15 via-gray-400/8 to-transparent', border: 'border-gray-400/30', icon: 'text-piu-silver', label: '2nd' },
  { bg: 'from-orange-600/15 via-amber-700/8 to-transparent', border: 'border-amber-700/30', icon: 'text-piu-bronze', label: '3rd' },
];

const AWARD_LABELS = {
  overall: 'Overall',
  singles: 'Singles',
  doubles: 'Doubles',
  advanced: 'Advanced',
  intermediate: 'Intermediate',
};

function TrophyIcon({ rank, className = '' }) {
  const color = rank === 1 ? 'text-piu-gold' : rank === 2 ? 'text-piu-silver' : 'text-piu-bronze';
  return (
    <span className={`${color} ${className}`}>
      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
    </span>
  );
}

function PodiumCard({ award }) {
  const style = PODIUM_COLORS[award.rank - 1] || PODIUM_COLORS[2];
  const avatarUrl = getAvatarUrl(award.avatar_snapshot, 'sm');

  return (
    <div className={`flex items-center gap-2 rounded-lg border ${style.border} bg-gradient-to-r ${style.bg} px-2.5 py-1.5 min-w-0`}>
      <TrophyIcon rank={award.rank} className="text-sm shrink-0" />
      {avatarUrl && (
        <img src={avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full border border-white/20 object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <Link
          to={`/profile/${award.user_id}`}
          className="block truncate text-[11px] font-display font-bold text-white hover:text-piu-gold transition-colors"
        >
          {award.nationality_snapshot && (
            <>{getCountryFlag(award.nationality_snapshot, 'h-[11px] inline-block mr-0.5')} </>
          )}
          {award.username_snapshot}
        </Link>
      </div>
      <span className="shrink-0 text-[10px] font-display font-bold text-white/60">
        {(award.points || 0).toLocaleString()}
      </span>
    </div>
  );
}

export default function WeeklyChallengePodiumStrip({ awards = [], compact = false }) {
  if (!awards || awards.length === 0) return null;

  // Group by award_key
  const grouped = {};
  for (const a of awards) {
    if (!grouped[a.award_key]) grouped[a.award_key] = [];
    grouped[a.award_key].push(a);
  }

  if (compact) {
    // Compact mode: just show overall top 3 in a horizontal strip
    const overall = grouped.overall || [];
    if (overall.length === 0) return null;
    return (
      <div className="flex flex-col gap-1">
        {overall.map((a, i) => (
          <PodiumCard key={`${a.award_key}-${a.rank}`} award={a} />
        ))}
      </div>
    );
  }

  // Full mode: show all award categories
  const order = ['overall', 'singles', 'doubles', 'advanced', 'intermediate'];
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
      {order.map(key => {
        const entries = grouped[key];
        if (!entries || entries.length === 0) return null;
        return (
          <div key={key} className="min-w-[200px] shrink-0">
            <h4 className="font-display text-[9px] font-black tracking-[0.12em] uppercase text-white/50 mb-1.5">
              {AWARD_LABELS[key] || key}
            </h4>
            <div className="flex flex-col gap-1">
              {entries.sort((a, b) => a.rank - b.rank).map(a => (
                <PodiumCard key={`${a.award_key}-${a.rank}`} award={a} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { TrophyIcon, AWARD_LABELS, PODIUM_COLORS };
