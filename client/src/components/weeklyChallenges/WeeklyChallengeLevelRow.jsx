import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../AvatarPicker';
import { getCountryFlag } from '../PlayerRegistration';

function getModeColor(mode) {
  if (mode === 'Single') return 'border-rose-500/40 text-rose-400';
  if (mode === 'Double') return 'border-emerald-500/40 text-emerald-400';
  return 'border-sky-500/40 text-sky-400';
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
  if (!grade) return 'text-gray-500';
  if (grade.includes('SSS')) return 'text-sky-300';
  if (grade.includes('SS')) return 'text-piu-gold';
  if (grade.includes('S')) return 'text-amber-400';
  if (grade.includes('AAA')) return 'text-piu-silver';
  if (grade.includes('AA')) return 'text-piu-bronze';
  return 'text-gray-400';
}

function ChartCard({ chart, viewerBest }) {
  const jacketUrl = chart.jacket_url_snapshot || '';
  const top3 = chart.top3 || [];

  return (
    <div className={`rounded-lg border border-white/[0.06] bg-gradient-to-br ${getModeBg(chart.mode)} overflow-hidden`}>
      <div className="flex gap-2.5 p-2.5">
        {/* Jacket thumbnail */}
        <div className="relative h-14 w-14 shrink-0 rounded-md overflow-hidden bg-black/40">
          {jacketUrl ? (
            <img src={jacketUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-800 to-gray-900" />
          )}
          <span className={`absolute bottom-0.5 right-0.5 inline-flex items-center rounded border px-1 py-px font-display text-[8px] font-black text-white ${getModeColor(chart.mode)}`}>
            {getModeShort(chart.mode)}{chart.level}
          </span>
        </div>

        {/* Chart info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-display font-bold text-white leading-tight">
            {chart.song_title_snapshot}
          </p>
          <p className="truncate text-[9px] text-white/40 mt-0.5">
            {chart.artist_snapshot}
          </p>

          {/* Stats row */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] text-white/30">
              {chart.participantCount || 0} played
            </span>
            <span className="text-[9px] text-white/30">
              {chart.clearCount || 0} cleared
            </span>
          </div>
        </div>
      </div>

      {/* Top 3 */}
      {top3.length > 0 && (
        <div className="border-t border-white/[0.04] px-2.5 py-1.5">
          {top3.map((entry, i) => {
            const avatarUrl = getAvatarUrl(entry.avatar, 'sm');
            return (
              <div key={entry.user_id} className="flex items-center gap-1.5 py-0.5">
                <span className={`w-3 shrink-0 text-center text-[9px] font-display font-black ${
                  i === 0 ? 'text-piu-gold' : i === 1 ? 'text-piu-silver' : 'text-piu-bronze'
                }`}>
                  {i + 1}
                </span>
                {avatarUrl && (
                  <img src={avatarUrl} alt="" className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/15 object-cover" />
                )}
                <Link
                  to={`/profile/${entry.user_id}`}
                  className="min-w-0 flex-1 truncate text-[9px] font-display font-bold text-white/80 hover:text-white"
                >
                  {entry.nationality && getCountryFlag(entry.nationality, 'h-[9px] inline-block mr-0.5')}
                  {entry.username}
                </Link>
                <span className={`shrink-0 text-[9px] font-display font-bold ${getGradeColor(entry.grade)}`}>
                  {(entry.score || 0).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Viewer's best */}
      {viewerBest && (
        <div className="border-t border-piu-gold/15 bg-piu-gold/[0.04] px-2.5 py-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-display font-bold text-piu-gold/70">Your best</span>
            <span className={`text-[10px] font-display font-bold ${getGradeColor(viewerBest.grade)}`}>
              {(viewerBest.score || 0).toLocaleString()}
              <span className="text-white/30 ml-1 text-[8px]">{viewerBest.grade}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeeklyChallengeLevelRow({ level, charts = [], viewerBests = {} }) {
  const [collapsed, setCollapsed] = useState(false);

  if (charts.length === 0) return null;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left mb-1.5 group"
      >
        <span className="font-display text-[11px] font-black text-white/60 group-hover:text-white/80 transition-colors">
          Lv.{level}
        </span>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <svg
          className={`h-3 w-3 text-white/30 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {charts.map(chart => (
            <ChartCard
              key={chart.id}
              chart={chart}
              viewerBest={viewerBests?.[chart.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
