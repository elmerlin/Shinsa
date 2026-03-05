import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getRank(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function getGradeColor(grade, score = 0) {
  const normalized = String(grade || '').toUpperCase();
  if (normalized) {
    if (normalized.includes('SSS')) return 'text-sky-300';
    if (normalized.includes('SS')) return 'text-piu-gold';
    if (normalized.includes('S')) return 'text-amber-400';
    if (normalized.includes('AAA')) return 'text-piu-silver';
    if (normalized.includes('AA')) return 'text-piu-bronze';
    if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  }
  return getRank(score).color;
}

function ChartModeBadge({ mode, level }) {
  const isSingle = mode === 'Single';
  const label = `${isSingle ? 'S' : 'D'}${level}`;

  return (
    <span
      className={`absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full min-w-[34px] h-6 px-1.5 border text-white font-display font-black text-[11px] ${
        isSingle
          ? 'bg-gradient-to-b from-red-500 to-red-800 border-red-300/50'
          : 'bg-gradient-to-b from-green-500 to-emerald-800 border-green-300/50'
      }`}
    >
      {label}
    </span>
  );
}

export default function PumbilityBreakdownModal({
  open,
  title,
  rows,
  onClose,
  showIncompleteCta = false,
  ctaMessage = '',
}) {
  const [openSongInfoKey, setOpenSongInfoKey] = useState('');

  useEffect(() => {
    if (!open) setOpenSongInfoKey('');
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm sm:text-base">{title}</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-3 space-y-2">
          {(rows || []).map((row, index) => {
            const grade = row.grade || getRank(row.score).label;
            const rowKey = `${row.chart_id || 'chart'}-${index}`;
            const isInfoOpen = openSongInfoKey === rowKey;

            return (
              <div key={rowKey} className="rounded-lg border border-piu-border/40 bg-piu-dark/45 px-2.5 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 shrink-0 text-[11px] text-gray-500 font-mono text-right">#{index + 1}</span>

                  <button
                    type="button"
                    onClick={() => setOpenSongInfoKey((prev) => (prev === rowKey ? '' : rowKey))}
                    className="relative w-16 h-10 rounded overflow-hidden border border-piu-border/40 shrink-0 hover:border-piu-accent/50 transition-colors"
                    title={`${row.title || 'Unknown song'}${row.artist ? ` — ${row.artist}` : ''}`}
                    aria-label={`Show song info for ${row.title || 'song'}`}
                  >
                    {row.jacket_url ? (
                      <img src={row.jacket_url} alt={row.title || 'Song jacket'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-piu-dark flex items-center justify-center text-[10px] text-gray-500">No art</div>
                    )}
                    <ChartModeBadge mode={row.mode} level={row.level} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-mono text-gray-100">{formatNumber(row.score)}</p>
                      <p className={`text-sm font-display font-bold ${getGradeColor(grade, row.score)}`}>{grade}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[11px] text-gray-500">Tap jacket for song info</p>
                      <p className="text-xs font-mono text-piu-gold">R {formatNumber(row.rating)}</p>
                    </div>

                    {isInfoOpen && (
                      <div className="mt-1.5 rounded-md border border-piu-border/35 bg-[#0b1324]/70 px-2 py-1.5">
                        <p className="text-xs font-display font-bold leading-tight break-words">{row.title || 'Unknown song'}</p>
                        <p className="text-[11px] text-gray-400 break-words">{row.artist || 'Unknown artist'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {(rows || []).length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">No rated songs yet.</p>
          )}

          {showIncompleteCta && (
            <div className="mt-3 rounded-lg border border-piu-border/45 bg-piu-dark/35 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">
                {ctaMessage || 'This pumbility sheet is partial. Sign up and sync your PIUGAME account for full Top 50 data.'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Link
                  to="/register"
                  className="px-2.5 py-1 rounded border border-piu-border/60 text-[11px] font-display font-bold text-gray-200 hover:text-white hover:bg-piu-dark/60 transition-colors"
                >
                  Sign Up
                </Link>
                <Link
                  to="/account"
                  className="px-2.5 py-1 rounded border border-piu-accent/50 text-[11px] font-display font-bold text-piu-accent hover:text-white hover:bg-piu-accent/20 transition-colors"
                >
                  Sync PIUGAME
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
