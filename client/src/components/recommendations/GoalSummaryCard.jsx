function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function TitleSummary({ summary }) {
  if (!summary) return null;
  const { current_title, next_title, points_remaining, estimated_passes, estimate_label } = summary;

  const progress = next_title?.required_points
    ? Math.max(0, Math.min(100, 100 - (points_remaining / next_title.required_points * 100)))
    : 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {current_title && (
          <span className="text-xs font-display font-bold text-gray-400">
            {current_title.skill_title || current_title.name}
          </span>
        )}
        <svg className="w-3 h-3 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {next_title && (
          <span className="text-xs font-display font-bold text-piu-accent">
            {next_title.skill_title || next_title.name}
          </span>
        )}
      </div>

      <div className="w-full bg-piu-dark rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-piu-accent to-pink-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-lg font-display font-black text-white">
          {formatNumber(points_remaining)}
        </span>
        <span className="text-xs text-gray-400">points remaining</span>
      </div>

      {estimate_label && (
        <p className="text-[11px] text-gray-500 font-body">
          {estimate_label}
        </p>
      )}
    </div>
  );
}

function PumbilitySummary({ summary }) {
  if (!summary) return null;
  const { current_pumbility, frontier_size, selection_note } = summary;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-display font-black text-white">
          {formatNumber(current_pumbility)}
        </span>
        <span className="text-xs text-gray-400">pumbility</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-display text-piu-accent font-bold">
          {frontier_size} upgradeable
        </span>
      </div>

      {selection_note && (
        <p className="text-[11px] text-gray-500 font-body">
          {selection_note}
        </p>
      )}
    </div>
  );
}

export default function GoalSummaryCard({ goal, summary, status }) {
  if (status === 'needs_import') {
    return (
      <div className="card border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-display font-bold text-amber-300">Import your scores</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Sync your best scores from PIU Game to unlock recommendations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'all_completed') {
    return (
      <div className="card border-piu-accent/30 bg-piu-accent/5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-piu-accent/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-piu-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-display font-bold text-piu-accent">All titles earned!</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Switch to Pumbility to keep pushing your scores higher.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {goal === 'title' ? (
        <TitleSummary summary={summary} />
      ) : (
        <PumbilitySummary summary={summary} />
      )}
    </div>
  );
}
