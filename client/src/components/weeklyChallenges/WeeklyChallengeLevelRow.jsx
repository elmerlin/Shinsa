import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../AvatarPicker';
import { getCountryFlag } from '../../utils/countryFlags';
import WeeklyChallengeBonusChip from './WeeklyChallengeBonusChip';

const LEVEL_ROW_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '320px',
};

function getLevelBadgeTone(mode) {
  if (String(mode || '').trim() === 'Single')
    return 'border-rose-200/45 bg-gradient-to-br from-[#ff7a7a] via-[#d93d62] to-[#7a1730] shadow-[0_2px_8px_rgba(217,61,98,0.3)]';
  if (String(mode || '').trim() === 'Double')
    return 'border-emerald-200/45 bg-gradient-to-br from-[#4cf4aa] via-[#16b77f] to-[#0b5d48] shadow-[0_2px_8px_rgba(22,183,127,0.28)]';
  return 'border-sky-200/45 bg-gradient-to-br from-[#69c8ff] via-[#2b88de] to-[#12457c] shadow-[0_2px_8px_rgba(43,136,222,0.28)]';
}

function getModeBg(mode) {
  if (mode === 'Single') return 'from-rose-500/8 via-transparent to-transparent';
  if (mode === 'Double') return 'from-emerald-500/8 via-transparent to-transparent';
  return 'from-sky-500/8 via-transparent to-transparent';
}

function getModeShort(mode) {
  return mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : 'C';
}

function getGradeColor(grade) {
  if (!grade) return 'text-zinc-500';
  if (grade.includes('SSS')) return 'text-sky-300';
  if (grade.includes('SS')) return 'text-piu-gold';
  if (grade.includes('S')) return 'text-amber-400';
  if (grade.includes('AAA')) return 'text-piu-silver';
  if (grade.includes('AA')) return 'text-piu-bronze';
  return 'text-zinc-400';
}

function ChartCard({ chart, viewerBest, onClick }) {
  const jacketUrl = chart.jacket_url_snapshot || '';
  const top3 = chart.top3 || [];

  return (
    <div
      className={`rounded-xl border border-white/[0.06] bg-gradient-to-br ${getModeBg(chart.mode)} overflow-hidden ${onClick ? 'cursor-pointer hover:border-white/15 transition-colors' : ''}`}
      onClick={() => onClick && onClick(chart)}
      role={onClick ? 'button' : undefined}
    >
      {/* Jacket hero with mode badge */}
      <div className="relative aspect-[16/10] overflow-hidden bg-black/40">
        {jacketUrl ? (
          <img src={jacketUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <span className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 font-display text-[10px] font-black leading-none tracking-[-0.02em] text-white ${getLevelBadgeTone(chart.mode)}`}>
          {getModeShort(chart.mode)}{chart.level}
        </span>
        {/* Song title overlaid on jacket */}
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pb-2">
          <p className="text-sm font-display font-bold text-white leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] line-clamp-1">
            {chart.song_title_snapshot}
          </p>
          <p className="text-[10px] text-white/50 mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-1">
            {chart.artist_snapshot}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.04]">
        <span className="text-[10px] text-white/30 font-display">
          <span className="font-bold text-white/50">{chart.participantCount || 0}</span> played
        </span>
        <span className="text-[10px] text-white/30 font-display">
          <span className="font-bold text-white/50">{chart.clearCount || 0}</span> cleared
        </span>
      </div>

      {/* Top 3 */}
      {top3.length > 0 && (
        <div className="px-3 py-2">
          {top3.map((entry, i) => {
            const avatarUrl = getAvatarUrl(entry.avatar, 'sm');
            return (
              <div key={entry.user_id} className="flex items-center gap-2 py-1">
                <span className={`w-4 shrink-0 text-center text-[10px] font-display font-black ${
                  i === 0 ? 'text-piu-gold' : i === 1 ? 'text-piu-silver' : 'text-piu-bronze'
                }`}>
                  {['\u{1F947}', '\u{1F948}', '\u{1F949}'][i]}
                </span>
                {avatarUrl && (
                  <img src={avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full border border-white/15 object-cover" loading="lazy" decoding="async" />
                )}
                <Link
                  to={`/profile/${entry.user_id}`}
                  className="min-w-0 flex-1 truncate text-xs font-display font-bold text-white/80 hover:text-white"
                >
                  {entry.nationality && getCountryFlag(entry.nationality, 'h-[11px] inline-block mr-0.5')}
                  {entry.username}
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`text-xs font-display font-bold tabular-nums ${getGradeColor(entry.grade)}`}>
                    {(entry.score || 0).toLocaleString()}
                  </span>
                  <WeeklyChallengeBonusChip entry={entry} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Viewer's best */}
      {viewerBest && (
        <div className="border-t border-piu-gold/15 bg-piu-gold/[0.04] px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display font-bold text-piu-gold/70">Your best</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-display font-bold tabular-nums ${getGradeColor(viewerBest.grade)}`}>
                {(viewerBest.score || 0).toLocaleString()}
                <span className="text-white/30 ml-1 text-[10px]">{viewerBest.grade}</span>
              </span>
              <WeeklyChallengeBonusChip entry={viewerBest} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeeklyChallengeLevelRow({ level, charts = [], viewerBests = {}, onChartClick }) {
  const [collapsed, setCollapsed] = useState(false);

  if (charts.length === 0) return null;

  return (
    <div className="mb-5" style={LEVEL_ROW_STYLE}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-3 w-full text-left mb-3 group"
      >
        <span className="font-display text-base font-black text-white/60 group-hover:text-white/80 transition-colors">
          Lv. {level}
        </span>
        <span className="text-xs text-white/20 font-display">
          {charts.length} chart{charts.length !== 1 ? 's' : ''}
        </span>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <svg
          className={`h-4 w-4 text-white/30 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-2 gap-3">
          {charts.map(chart => (
            <ChartCard
              key={chart.id}
              chart={chart}
              viewerBest={viewerBests?.[chart.id]}
              onClick={onChartClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
