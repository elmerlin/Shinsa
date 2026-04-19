import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import PiuChartJacket, { resolveChartJacketUrl } from './PiuChartJacket';
import { getProfilePath } from '../utils/profile';
import { renderFormattedText } from '../utils/formatText';

function ModeBadge({ mode, level }) {
  const modeShort = mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : 'C';
  const tone =
    mode === 'Single'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/25'
      : mode === 'Double'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
        : 'bg-sky-500/15 text-sky-300 border-sky-500/25';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-display font-black ${tone}`}>
      {modeShort}
      {level || ''}
    </span>
  );
}

export default function SongOfWeekCard({
  pick,
  jacketLookup = {},
  chartKeyMap = {},
  variant = 'feed',
  showOwnerActions = false,
  onEdit,
  onCreate,
  headline,
}) {
  if (!pick) {
    if (variant === 'spotlight' && showOwnerActions) {
      return (
        <div className="card flex flex-col sm:flex-row sm:items-center gap-3 border border-dashed border-piu-border/40">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-piu-accent font-display font-bold">
              Song of the Week
            </p>
            <p className="text-sm text-gray-300 mt-1">
              Pick one chart to feature as your Song of the Week this week.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="btn-primary text-xs whitespace-nowrap"
          >
            Set Song of the Week
          </button>
        </div>
      );
    }
    return null;
  }

  const jacketUrl = resolveChartJacketUrl({
    title: pick.song_title_snapshot,
    mode: pick.mode,
    level: pick.level,
    jacketLookup,
    jacketUrl: pick.jacket_url_snapshot,
  });
  const normalizedTitle = String(pick.song_title_snapshot || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const exactKey = `${normalizedTitle}|${pick.mode}|${pick.level}`;
  const chartKeyId = chartKeyMap?.[exactKey] || chartKeyMap?.[normalizedTitle];
  const chartLink = chartKeyId
    ? `/songs/chart/${chartKeyId}`
    : pick.chart_id
      ? `/songs/chart/${pick.chart_id}`
      : `/songs?q=${encodeURIComponent(pick.song_title_snapshot || '')}`;
  const detailLink = `/song-of-the-week/${pick.id}`;
  const avatarUrl = pick.avatar ? getAvatarUrl(pick.avatar) : '';

  return (
    <div className={variant === 'spotlight' ? 'card border border-piu-accent/30 bg-gradient-to-br from-piu-accent/10 via-piu-card to-piu-card' : 'card'}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-piu-accent font-display font-bold">
            {headline || 'Song of the Week'}
          </p>
          {variant !== 'spotlight' && pick.username && (
            <Link
              to={getProfilePath(pick.user_id, pick.username)}
              className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-display font-bold text-white hover:text-piu-accent"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : null}
              <span className="truncate">{pick.username}</span>
            </Link>
          )}
        </div>
        {showOwnerActions && (
          <button
            type="button"
            onClick={onEdit}
            className="text-[10px] text-piu-accent hover:text-piu-accent/80 font-display font-bold whitespace-nowrap"
          >
            Edit
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <Link to={chartLink} className="group shrink-0">
          <PiuChartJacket
            title={pick.song_title_snapshot}
            mode={pick.mode}
            level={pick.level}
            jacketUrl={jacketUrl}
            size="wide"
            imageClassName="group-hover:scale-[1.04]"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={detailLink} className="block hover:opacity-90">
            <p className="text-sm font-display font-bold text-white truncate">
              {pick.song_title_snapshot || 'Untitled chart'}
            </p>
            {pick.artist_snapshot && (
              <p className="text-[11px] text-gray-400 truncate">{pick.artist_snapshot}</p>
            )}
          </Link>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <ModeBadge mode={pick.mode} level={pick.level} />
            {pick.linked_play && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 font-display font-bold">
                Recent play
              </span>
            )}
          </div>
          {pick.caption && (
            <p className="text-[11px] text-gray-300 mt-1 break-words">
              {renderFormattedText(pick.caption)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-piu-border/20">
        <Link
          to={detailLink}
          className="text-[11px] font-display font-bold text-piu-accent hover:text-piu-accent/80"
        >
          View & discuss
        </Link>
        {typeof pick.comment_count === 'number' && pick.comment_count > 0 && (
          <span className="text-[10px] text-gray-500">
            {pick.comment_count} comment{pick.comment_count === 1 ? '' : 's'}
          </span>
        )}
        <Link
          to={chartLink}
          className="ml-auto text-[10px] text-gray-400 hover:text-piu-accent font-display"
        >
          Open chart &rarr;
        </Link>
      </div>
    </div>
  );
}
