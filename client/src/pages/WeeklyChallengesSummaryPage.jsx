import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWeeklyChallengesSummary } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../utils/countryFlags';
import { getProfilePath } from '../utils/profile';
import PlateBadge from '../components/ui/plate-badge';

// Weekly Challenges — all-time "Hall of Fame". Aggregates every finalized
// week into rating/wins/judgment leaderboards. Companion to the per-week
// WeeklyChallengesPage; reached via the "All-Time" entry in the week menu.

const MEDAL_TONE = ['text-piu-gold', 'text-piu-silver', 'text-piu-bronze'];

function fmt(n) {
  return (Number(n) || 0).toLocaleString();
}

function modeTone(mode) {
  if (mode === 'Single') return 'from-[#ff7a7a] via-[#d93d62] to-[#7a1730]';
  if (mode === 'Double') return 'from-[#4cf4aa] via-[#16b77f] to-[#0b5d48]';
  return 'from-[#69c8ff] via-[#2b88de] to-[#12457c]';
}
function modeShort(mode) {
  return mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : 'C';
}

function Avatar({ avatar, username, size = 'h-7 w-7' }) {
  const url = avatar ? getAvatarUrl(avatar) : '';
  if (url) {
    return <img src={url} alt="" className={`${size} shrink-0 rounded-full border border-white/10 object-cover`} loading="lazy" decoding="async" />;
  }
  return (
    <div className={`${size} shrink-0 rounded-full bg-piu-dark flex items-center justify-center text-[11px] font-display font-bold text-white/70`}>
      {(username || '?')[0]}
    </div>
  );
}

// ── One player row in a stat leaderboard ─────────────────────────
function PlayerRow({ rank, row, value, sub }) {
  return (
    <Link
      to={getProfilePath(row.user_id, row.username)}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
    >
      <span className={`w-5 shrink-0 text-center text-xs font-display font-black tabular-nums ${rank <= 3 ? MEDAL_TONE[rank - 1] : 'text-zinc-600'}`}>
        {rank}
      </span>
      <Avatar avatar={row.avatar} username={row.username} />
      <span className="flex-1 min-w-0 truncate text-[13px] font-display font-bold text-white/85">
        {row.nationality ? <span className="mr-1">{getCountryFlag(row.nationality)}</span> : null}
        {row.username}
      </span>
      <div className="shrink-0 text-right">
        <span className="text-[13px] font-display font-black text-white tabular-nums">{value}</span>
        {sub ? <span className="block text-[10px] leading-tight text-white/35">{sub}</span> : null}
      </div>
    </Link>
  );
}

// ── A stat leaderboard card ──────────────────────────────────────
function StatCard({ icon, title, hint, rows, valueOf, subOf, emptyLabel = 'No data yet' }) {
  return (
    <div className="rounded-xl border border-piu-border/50 bg-white/[0.015] p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-[13px] font-black uppercase tracking-wide text-white/80">
          {icon ? <span className="text-sm">{icon}</span> : null}
          {title}
        </h3>
        {hint ? <span className="text-[10px] font-display text-white/30">{hint}</span> : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-white/25">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((row, i) => (
            <PlayerRow key={`${row.user_id}-${i}`} rank={i + 1} row={row} value={valueOf(row)} sub={subOf ? subOf(row) : null} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Totals banner tile ───────────────────────────────────────────
function TotalTile({ value, label }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-piu-border/40 bg-white/[0.02] px-2 py-2.5 text-center">
      <span className="font-display text-lg font-black text-white tabular-nums leading-none sm:text-xl">{fmt(value)}</span>
      <span className="mt-1 text-[9px] font-display font-bold uppercase tracking-wider text-white/35">{label}</span>
    </div>
  );
}

// ── Top Plays hero row ───────────────────────────────────────────
function TopPlayRow({ rank, play }) {
  return (
    <div className={`relative flex items-center gap-3 rounded-xl border p-2.5 ${
      rank <= 3 ? 'border-piu-gold/20 bg-gradient-to-r from-piu-gold/[0.05] to-transparent' : 'border-piu-border/40 bg-white/[0.015]'
    }`}>
      <span className={`w-6 shrink-0 text-center font-display text-base font-black tabular-nums ${rank <= 3 ? MEDAL_TONE[rank - 1] : 'text-zinc-600'}`}>
        {rank}
      </span>
      {/* Jacket + mode badge */}
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-piu-border/50">
        {play.jacket_url ? (
          <img src={play.jacket_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="h-full w-full bg-piu-dark" />
        )}
        <span className={`absolute bottom-0 right-0 rounded-tl-md bg-gradient-to-br ${modeTone(play.mode)} px-1 py-px font-display text-[8px] font-black leading-none text-white`}>
          {modeShort(play.mode)}{play.level}
        </span>
      </div>
      {/* Song + player */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[13px] font-bold text-white">{play.song_title}</p>
        <Link to={getProfilePath(play.user_id, play.username)} className="mt-0.5 flex items-center gap-1.5 text-white/50 hover:text-white/80">
          <Avatar avatar={play.avatar} username={play.username} size="h-4 w-4" />
          <span className="truncate text-[11px] font-display font-bold">
            {play.nationality ? <span className="mr-0.5">{getCountryFlag(play.nationality)}</span> : null}
            {play.username}
          </span>
          <span className="text-[10px] text-white/25">· {play.week_key}</span>
        </Link>
      </div>
      {/* Score + points */}
      <div className="shrink-0 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <span className="font-display text-sm font-black text-white tabular-nums">{fmt(play.score)}</span>
          <PlateBadge plate={play.plate} size="xs" />
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-1.5">
          <span className="text-[10px] font-display text-white/40">{play.grade}</span>
          <span className="font-display text-xs font-black text-piu-gold tabular-nums">{fmt(play.rating_points)} pts</span>
        </div>
      </div>
    </div>
  );
}

// ── Wins card (overall / singles / doubles mini-boards) ──────────
function WinsColumn({ label, tone, rows }) {
  return (
    <div>
      <p className={`mb-1.5 font-display text-[10px] font-black uppercase tracking-wider ${tone}`}>{label}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-white/25">—</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.slice(0, 3).map((row, i) => (
            <Link
              key={row.user_id}
              to={getProfilePath(row.user_id, row.username)}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/[0.04]"
            >
              <span className={`w-3 text-center text-[10px] font-display font-black tabular-nums ${i <= 2 ? MEDAL_TONE[i] : 'text-zinc-600'}`}>{i + 1}</span>
              <Avatar avatar={row.avatar} username={row.username} size="h-5 w-5" />
              <span className="flex-1 min-w-0 truncate text-[11px] font-display font-bold text-white/80">{row.username}</span>
              <span className="text-[11px] font-display font-black text-white tabular-nums">{row.value}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WeeklyChallengesSummaryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getWeeklyChallengesSummary()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const totals = data?.totals || {};
  const noData = data && (data.totals?.chartsCleared || 0) === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <h1 className="font-display text-xl font-black uppercase tracking-wide text-white sm:text-2xl">
              Hall of Fame
            </h1>
          </div>
          <p className="mt-1 text-xs text-white/40 sm:text-sm">All-time records across every weekly challenge</p>
        </div>
        <Link
          to="/weekly-challenges"
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-display font-bold text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          This week
        </Link>
      </div>

      {loading && (
        <div className="py-16 text-center text-sm text-zinc-500">Loading records…</div>
      )}
      {error && !loading && (
        <div className="py-16 text-center text-sm text-zinc-500">Couldn’t load the summary. Try again shortly.</div>
      )}

      {data && !loading && (
        <>
          {/* Totals banner */}
          <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <TotalTile value={totals.weeks} label="Weeks" />
            <TotalTile value={totals.players} label="Players" />
            <TotalTile value={totals.chartsCleared} label="Cleared" />
            <TotalTile value={totals.ratingPoints} label="Points" />
            <TotalTile value={totals.perfects} label="Perfects" />
            <TotalTile value={totals.sssPlus} label="SSS+" />
          </div>

          {noData ? (
            <p className="py-12 text-center text-sm text-white/30">
              No finalized weekly challenges yet — records will appear once the first week closes.
            </p>
          ) : (
            <>
              {/* Top Plays hero */}
              <section className="mb-7">
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h2 className="font-display text-xs font-black uppercase tracking-[0.14em] text-white/45">Top Plays</h2>
                  <span className="text-[10px] font-display text-white/25">by rating points earned</span>
                </div>
                <div className="grid gap-1.5 lg:grid-cols-2">
                  {(data.topPlays || []).map((play, i) => (
                    <TopPlayRow key={`${play.user_id}-${play.song_title}-${i}`} rank={i + 1} play={play} />
                  ))}
                </div>
              </section>

              {/* Wins */}
              <section className="mb-6">
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h2 className="font-display text-xs font-black uppercase tracking-[0.14em] text-white/45">Champions</h2>
                  <span className="text-[10px] font-display text-white/25">most weekly wins</span>
                </div>
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-piu-border/50 bg-white/[0.015] p-4 sm:grid-cols-3">
                  <WinsColumn label="Overall" tone="text-piu-gold" rows={data.wins?.overall || []} />
                  <WinsColumn label="Singles" tone="text-rose-400" rows={data.wins?.singles || []} />
                  <WinsColumn label="Doubles" tone="text-emerald-400" rows={data.wins?.doubles || []} />
                </div>
              </section>

              {/* Stat leaderboards */}
              <section>
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h2 className="font-display text-xs font-black uppercase tracking-[0.14em] text-white/45">Leaderboards</h2>
                  <span className="text-[10px] font-display text-white/25">all-time totals</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <StatCard
                    icon="⚡" title="All-Time Points" hint="total rating"
                    rows={data.mostRatingPoints || []}
                    valueOf={(r) => fmt(r.value)}
                    subOf={(r) => `${fmt(r.charts)} charts`}
                  />
                  <StatCard
                    icon="🎖️" title="Most Podiums" hint="top-3 finishes"
                    rows={data.mostPodiums || []}
                    valueOf={(r) => fmt(r.value)}
                  />
                  <StatCard
                    icon="✅" title="Songs Cleared" hint="challenge charts passed"
                    rows={data.mostSongsCleared || []}
                    valueOf={(r) => fmt(r.value)}
                    subOf={(r) => `${fmt(r.sss_plus)} SSS+`}
                  />
                  <StatCard
                    icon="💎" title="Most SSS+" hint="top-grade clears"
                    rows={data.mostSSS || []}
                    valueOf={(r) => fmt(r.value)}
                    subOf={(r) => `+${fmt(r.sss)} SSS`}
                  />
                  <StatCard
                    icon="🎯" title="Most Perfects" hint="total PG judgments"
                    rows={data.mostPerfects || []}
                    valueOf={(r) => fmt(r.value)}
                    subOf={(r) => `${fmt(r.charts)} charts`}
                  />
                  <StatCard
                    icon="🏵️" title="Perfect Games" hint="flawless PG plates"
                    rows={data.mostPerfectGames || []}
                    valueOf={(r) => fmt(r.value)}
                  />
                  <StatCard
                    icon="📅" title="Most Weeks Entered" hint="loyalty"
                    rows={data.mostChallenges || []}
                    valueOf={(r) => `${fmt(r.value)} wk`}
                    subOf={(r) => `${fmt(r.points)} pts`}
                  />
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
