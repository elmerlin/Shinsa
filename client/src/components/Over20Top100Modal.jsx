import React, { useEffect, useState } from 'react';
import { getAvatarUrl } from './AvatarPicker';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function normalizeNameKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getGradeColorClass(grade) {
  const normalized = String(grade || '').trim().toUpperCase();
  if (normalized.includes('SSS')) return 'text-sky-300';
  if (normalized.includes('SS+')) return 'text-yellow-300';
  if (normalized === 'SS') return 'text-yellow-400';
  if (normalized === 'S+' || normalized === 'S') return 'text-amber-400';
  if (normalized.includes('AAA')) return 'text-gray-200';
  if (normalized.includes('AA')) return 'text-orange-300';
  if (normalized.startsWith('A')) return 'text-orange-400';
  if (normalized === 'B') return 'text-gray-400';
  if (normalized === 'C' || normalized === 'D' || normalized === 'F') return 'text-gray-500';
  return 'text-gray-400';
}

function RankDeltaIndicator({ delta, compact = false }) {
  const numericDelta = parseInt(delta, 10) || 0;
  if (!numericDelta) return null;

  const isUp = numericDelta > 0;
  const amount = Math.abs(numericDelta);
  const icon = isUp ? '^' : 'v';
  const colorClass = isUp
    ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10'
    : 'text-red-300 border-red-400/40 bg-red-500/10';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono font-bold ${compact ? 'text-[10px]' : 'text-[11px]'} ${colorClass}`}
      title={`Daily change: ${isUp ? '+' : '-'}${amount}`}
    >
      <span>{icon}</span>
      <span>{amount}</span>
    </span>
  );
}

function getChartModeBadgeColor(mode) {
  if (mode === 'Single') return 'bg-red-600';
  if (mode === 'Double') return 'bg-green-600';
  return 'bg-blue-600';
}

function OverChartJacket({ chart, size = 'md' }) {
  const isSmall = size === 'sm';
  const boxClass = isSmall ? 'w-10 h-10' : 'w-12 h-12';
  const badgeClass = isSmall
    ? 'min-w-[16px] h-[14px] px-1 text-[9px]'
    : 'min-w-[18px] h-[16px] px-1 text-[9px]';
  const level = parseInt(chart?.level, 10);
  const levelText = Number.isFinite(level) && level > 0 ? String(level) : '?';
  const badgeColor = getChartModeBadgeColor(chart?.mode);
  const titleInitial = String(chart?.song_title || '?').trim()[0] || '?';

  return (
    <div className="relative shrink-0">
      {chart?.jacket_url ? (
        <img
          src={chart.jacket_url}
          alt=""
          className={`${boxClass} rounded object-cover border border-piu-border/50`}
        />
      ) : (
        <div className={`${boxClass} rounded bg-piu-dark border border-piu-border/50 flex items-center justify-center font-display font-bold text-sm text-gray-500`}>
          {titleInitial}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 ${badgeClass} rounded flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
        {levelText}
      </span>
    </div>
  );
}

function toAbsolutePermalink(permalink) {
  const raw = String(permalink || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (typeof window === 'undefined' || !window.location?.origin) return raw;
  if (raw.startsWith('/')) return `${window.location.origin}${raw}`;
  return `${window.location.origin}/${raw}`;
}

export default function Over20Top100Modal({
  open,
  chart,
  scores,
  loading,
  error,
  permalink,
  highlightRank = 0,
  highlightName = '',
  highlightScore = 0,
  onClose,
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timeoutId = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const normalizedHighlightName = normalizeNameKey(highlightName);
  const numericHighlightScore = parseInt(highlightScore, 10) || 0;
  const hasExactHighlightMatch = normalizedHighlightName
    && numericHighlightScore > 0
    && (Array.isArray(scores) ? scores : []).some((row) => {
      const rowName = normalizeNameKey(row?.player_name);
      const rowScore = parseInt(row?.score, 10) || 0;
      return rowName === normalizedHighlightName && rowScore === numericHighlightScore;
    });

  const handlePermalink = async () => {
    const absoluteUrl = toAbsolutePermalink(permalink);
    if (!absoluteUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
        setCopied(true);
        return;
      }
    } catch {
      // Fall through to opening the permalink in a new tab when clipboard is unavailable.
    }
    window.open(absoluteUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-piu-border/60">
          <div className="min-w-0 flex items-center gap-2.5">
            <OverChartJacket chart={chart || {}} size="sm" />
            <div className="min-w-0">
              <p className="font-display font-bold text-sm truncate text-gray-100">
                {chart?.song_title || 'Top 100 Rankings'}
              </p>
              <p className="text-[11px] text-gray-500">
                {chart ? `${chart.mode} ${chart.level}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {permalink ? (
              <button
                type="button"
                onClick={handlePermalink}
                className="px-2.5 py-1 rounded border border-piu-border/60 text-[11px] font-display font-bold text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 transition-colors"
              >
                {copied ? 'Copied!' : 'Permalink'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded border border-piu-border/60 text-[11px] font-display font-bold text-gray-300 hover:text-white hover:bg-piu-dark/50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="px-4 py-4 text-xs text-gray-500">Loading top 100...</p>
          ) : error ? (
            <div className="px-4 py-4">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            </div>
          ) : !scores.length ? (
            <p className="px-4 py-4 text-xs text-gray-500">No top 100 rows available.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-piu-dark/70 sticky top-0">
                <tr className="border-b border-piu-border/40">
                  <th className="px-2 py-2 text-left text-gray-400 font-display">#</th>
                  <th className="px-2 py-2 text-left text-gray-400 font-display">Player</th>
                  <th className="px-2 py-2 text-right text-gray-400 font-display">Score</th>
                  <th className="px-2 py-2 text-right text-gray-400 font-display">Grade</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((score) => {
                  const avatar = String(score?.player_avatar || score?.player_avatar_url || '').trim();
                  const avatarSrc = avatar
                    ? (avatar.startsWith('data:') || avatar.startsWith('http') ? avatar : getAvatarUrl(avatar))
                    : '';
                  const playerName = String(score?.player_name || '').trim();
                  const initial = playerName ? playerName[0].toUpperCase() : '?';
                  const rank = parseInt(score?.rank, 10) || 0;
                  const rankDelta = parseInt(score?.rank_delta, 10) || 0;
                  const playerScore = parseInt(score?.score, 10) || 0;
                  const exactMatch = normalizedHighlightName
                    && numericHighlightScore > 0
                    && normalizeNameKey(playerName) === normalizedHighlightName
                    && playerScore === numericHighlightScore;
                  const isHighlighted = hasExactHighlightMatch ? exactMatch : (highlightRank > 0 && rank === highlightRank);
                  return (
                    <tr
                      key={`${score.rank}-${score.player_name}-${score.score}`}
                      className={`border-b border-piu-border/20 last:border-b-0 ${isHighlighted ? 'bg-piu-accent/10' : ''}`}
                    >
                      <td className={`px-2 py-1.5 font-mono ${isHighlighted ? 'text-piu-accent' : 'text-gray-500'}`}>
                        <div className="flex items-center gap-1.5">
                          <span>#{score.rank}</span>
                          <RankDeltaIndicator delta={rankDelta} compact />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-200">
                        <div className="flex items-center gap-2 min-w-0">
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover border border-piu-border/40 shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[10px] border border-piu-border/40 shrink-0">
                              {initial}
                            </div>
                          )}
                          <span className="truncate">{playerName || '-'}</span>
                          {isHighlighted ? (
                            <span className="px-1.5 py-0.5 rounded bg-piu-accent/30 text-[10px] font-display font-bold text-piu-accent shrink-0">
                              YOU
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-200">{formatNumber(score.score)}</td>
                      <td className={`px-2 py-1.5 text-right font-display font-bold ${getGradeColorClass(score.grade)}`}>{score.grade || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
