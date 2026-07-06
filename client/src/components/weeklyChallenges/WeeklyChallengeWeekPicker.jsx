import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

function formatWeekRange(startsAt, endsAt) {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
  } catch {
    return '';
  }
}

export default function WeeklyChallengeWeekPicker({ weeks = [], currentWeekKey, currentWeek = null, loadingWeeks = false, onOpen, onSelect, summaryHref = '/weekly-challenges/summary' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const current = weeks.find(w => w.week_key === currentWeekKey)
    || (currentWeek?.week_key === currentWeekKey ? currentWeek : null);

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) onOpen?.();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
      >
        <svg className="h-3.5 w-3.5 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-[11px] font-display font-bold text-white/70">
          {current ? formatWeekRange(current.starts_at_utc, current.ends_at_utc) : currentWeekKey}
        </span>
        <svg className={`h-3 w-3 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#111118] shadow-2xl">
          {summaryHref && (
            <Link
              to={summaryHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2.5 text-left transition-colors hover:bg-piu-gold/[0.06]"
            >
              <span className="text-sm">🏆</span>
              <div className="flex-1 min-w-0">
                <span className="block text-[11px] font-display font-black text-piu-gold">All-Time Stats</span>
                <span className="block text-[9px] text-white/40">Hall of Fame across every week</span>
              </div>
              <svg className="h-3 w-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
          {weeks.map(w => {
            const isCurrent = w.week_key === currentWeekKey;
            return (
              <button
                key={w.week_key}
                type="button"
                onClick={() => { onSelect(w.week_key); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.05] transition-colors ${
                  isCurrent ? 'bg-piu-dark/50' : ''
                }`}
              >
                <div>
                  <span className={`text-[11px] font-display font-bold ${isCurrent ? 'text-piu-gold' : 'text-white/80'}`}>
                    {w.week_key}
                  </span>
                  <span className="block text-[9px] text-white/40">
                    {formatWeekRange(w.starts_at_utc, w.ends_at_utc)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-white/30">
                    {w.participant_count || 0} players
                  </span>
                  {w.status === 'active' && (
                    <span className="block text-[8px] font-display font-bold text-emerald-400">LIVE</span>
                  )}
                </div>
              </button>
            );
          })}
          {weeks.length === 0 && (
            <p className="text-center text-[11px] text-white/30 py-4">{loadingWeeks ? 'Loading weeks...' : 'No weeks yet'}</p>
          )}
        </div>
      )}
    </div>
  );
}

export { formatWeekRange };
