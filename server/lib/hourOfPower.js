const { calculateRatingPoints, gradeFromScore, normalizeGrade } = require('./titleProgress');
const { formatDurationLabel } = require('./liveSessionSummary');
const { applyChartMetadata } = require('./activityPostEnrichment');

const LIVE_SESSION_TYPE = 'live';
const HOP_SESSION_TYPE = 'hop';
const DEFAULT_HOP_WARMUP_SECONDS = 20 * 60;
const DEFAULT_HOP_WINDOW_SECONDS = 60 * 60;

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSessionType(value) {
  return String(value || '').trim().toLowerCase() === HOP_SESSION_TYPE
    ? HOP_SESSION_TYPE
    : LIVE_SESSION_TYPE;
}

function isHourOfPowerSession(session) {
  return normalizeSessionType(session?.session_type) === HOP_SESSION_TYPE;
}

function parseSqliteDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseFlexibleDateTime(value) {
  const sqliteDate = parseSqliteDateTime(value);
  if (sqliteDate) return sqliteDate;
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSqliteDateTime(value) {
  const date = value instanceof Date ? value : parseFlexibleDateTime(value);
  if (!date) return '';
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function formatDisplayTime(value) {
  if (!(value instanceof Date)) return '';
  return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function resolveHourOfPowerConfig(session) {
  const enabled = isHourOfPowerSession(session);
  const warmupSeconds = Math.max(1, toInt(session?.hop_warmup_seconds) || DEFAULT_HOP_WARMUP_SECONDS);
  const windowSeconds = Math.max(1, toInt(session?.hop_window_seconds) || DEFAULT_HOP_WINDOW_SECONDS);
  const warmupStartedAt = parseSqliteDateTime(session?.hop_warmup_started_at)
    || parseSqliteDateTime(session?.started_at)
    || parseSqliteDateTime(session?.created_at)
    || new Date();
  const startedAt = parseSqliteDateTime(session?.hop_started_at)
    || new Date(warmupStartedAt.getTime() + (warmupSeconds * 1000));
  const endsAt = parseSqliteDateTime(session?.hop_ends_at)
    || new Date(startedAt.getTime() + (windowSeconds * 1000));

  return {
    enabled,
    warmupSeconds,
    windowSeconds,
    warmupStartedAt,
    startedAt,
    endsAt,
    warmupStartedAtMs: warmupStartedAt.getTime(),
    startedAtMs: startedAt.getTime(),
    endsAtMs: endsAt.getTime(),
  };
}

function resolveHourOfPowerPhase(session, nowMs = Date.now()) {
  const config = resolveHourOfPowerConfig(session);
  if (!config.enabled) return 'live';
  if (nowMs < config.startedAtMs) return 'warmup';
  if (nowMs < config.endsAtMs) return 'power';
  return 'finished';
}

function resolveHourOfPowerGrade(play) {
  const normalized = normalizeGrade(play?.grade || '');
  if (normalized) return normalized;
  return gradeFromScore(play?.score);
}

function buildDecoratedHourOfPowerPlay(row, config, durationSeconds) {
  const playedAt = parseSqliteDateTime(row?.played_at_utc) || parseFlexibleDateTime(row?.date_played);
  const playedAtMs = playedAt ? playedAt.getTime() : 0;
  const safeDurationSeconds = Math.max(0, toInt(durationSeconds));
  const startedAtMs = playedAtMs > 0
    ? Math.max(0, playedAtMs - (safeDurationSeconds * 1000))
    : 0;
  const startedAt = startedAtMs > 0 ? new Date(startedAtMs) : null;
  const grade = resolveHourOfPowerGrade(row);
  const ratingPoints = calculateRatingPoints(row?.level, grade, row?.score);

  let notCountedReason = '';
  let countsTowardsTotal = false;

  if (startedAtMs <= 0) {
    notCountedReason = 'unknown';
  } else if (startedAtMs < config.startedAtMs) {
    notCountedReason = 'warmup';
  } else if (startedAtMs >= config.endsAtMs) {
    notCountedReason = 'after_window';
  } else if (ratingPoints <= 0) {
    notCountedReason = 'fail';
  } else {
    countsTowardsTotal = true;
  }

  const statusLabel = countsTowardsTotal
    ? 'Counted'
    : notCountedReason === 'warmup'
      ? 'Warmup / Not Counted'
      : notCountedReason === 'after_window'
        ? 'After Time / Not Counted'
        : notCountedReason === 'fail'
          ? 'Failed / Not Counted'
          : 'Not Counted';

  return {
    ...row,
    hop_duration_seconds: safeDurationSeconds,
    hop_play_started_at_utc: formatSqliteDateTime(startedAt),
    hop_counts_towards_total: countsTowardsTotal,
    hop_not_counted_reason: notCountedReason,
    hop_status_label: statusLabel,
    hop_rating_points_earned: countsTowardsTotal ? ratingPoints : 0,
    hop_resolved_grade: grade,
    _hop_playedAtMs: playedAtMs,
    _hop_startedAtMs: startedAtMs,
  };
}

function compareChronologicalPlays(a, b) {
  if (a._hop_playedAtMs !== b._hop_playedAtMs) return a._hop_playedAtMs - b._hop_playedAtMs;
  return toInt(a.id) - toInt(b.id);
}

function compareRatedHopPlays(a, b) {
  if (b.hop_rating_points_earned !== a.hop_rating_points_earned) {
    return b.hop_rating_points_earned - a.hop_rating_points_earned;
  }
  if (toInt(b.score) !== toInt(a.score)) {
    return toInt(b.score) - toInt(a.score);
  }
  if (toInt(b.level) !== toInt(a.level)) {
    return toInt(b.level) - toInt(a.level);
  }
  return String(a.song_title || '').localeCompare(String(b.song_title || ''));
}

function summarizeHourOfPower(session, rows, options = {}) {
  if (!isHourOfPowerSession(session)) return null;

  const config = resolveHourOfPowerConfig(session);
  const getDurationSeconds = typeof options.getDurationSeconds === 'function'
    ? options.getDurationSeconds
    : () => 0;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const sourceRows = Array.isArray(rows) ? rows : [];

  const decoratedRows = sourceRows.map((row) => buildDecoratedHourOfPowerPlay(
    row,
    config,
    getDurationSeconds(row)
  ));
  const chronologicalRows = decoratedRows.slice().sort(compareChronologicalPlays);

  let runningTotal = 0;
  const countedRows = [];
  const runningTotalById = new Map();

  for (const row of chronologicalRows) {
    if (row.hop_counts_towards_total) {
      runningTotal += row.hop_rating_points_earned;
      countedRows.push({
        ...row,
        hop_running_total: runningTotal,
      });
    }
    runningTotalById.set(String(row.id || ''), runningTotal);
  }

  const decoratedRowsWithTotals = decoratedRows.map((row) => ({
    ...row,
    hop_running_total: runningTotalById.get(String(row.id || '')) || 0,
  }));
  const countedRowsChronological = countedRows.slice().sort(compareChronologicalPlays);
  const countedRowsByRating = countedRows.slice().sort(compareRatedHopPlays);
  const totalRatingPoints = countedRows.reduce((sum, row) => sum + row.hop_rating_points_earned, 0);
  const countedClearCount = countedRows.length;
  const averageLevel = countedClearCount > 0
    ? Number((countedRows.reduce((sum, row) => sum + toInt(row.level), 0) / countedClearCount).toFixed(1))
    : 0;
  const averageRatingPoints = countedClearCount > 0
    ? Number((totalRatingPoints / countedClearCount).toFixed(1))
    : 0;
  const highestPlay = countedRowsByRating[0] || null;
  const lowestPlay = countedRowsByRating.length > 0
    ? countedRowsByRating[countedRowsByRating.length - 1]
    : null;
  const endedAt = parseSqliteDateTime(session?.ended_at)
    || parseSqliteDateTime(session?.updated_at)
    || null;
  const effectiveEndAt = endedAt || new Date(nowMs);
  const sessionDurationMinutes = Math.max(
    0,
    Math.round((effectiveEndAt.getTime() - config.warmupStartedAtMs) / 60000)
  );

  return {
    session_type: HOP_SESSION_TYPE,
    phase: resolveHourOfPowerPhase(session, nowMs),
    warmup_started_at: formatSqliteDateTime(config.warmupStartedAt),
    started_at: formatSqliteDateTime(config.startedAt),
    ends_at: formatSqliteDateTime(config.endsAt),
    warmup_seconds: config.warmupSeconds,
    window_seconds: config.windowSeconds,
    remaining_warmup_ms: Math.max(0, config.startedAtMs - nowMs),
    remaining_window_ms: Math.max(0, config.endsAtMs - nowMs),
    total_rating_points: totalRatingPoints,
    counted_clear_count: countedClearCount,
    average_level: averageLevel,
    average_rating_points: averageRatingPoints,
    highest_rating_points: highestPlay?.hop_rating_points_earned || 0,
    lowest_rating_points: lowestPlay?.hop_rating_points_earned || 0,
    highest_play: highestPlay,
    lowest_play: lowestPlay,
    completed: toInt(session?.hop_completed) === 1,
    leaderboard_eligible: toInt(session?.hop_completed) === 1,
    session_duration_minutes: sessionDurationMinutes,
    session_duration_label: formatDurationLabel(sessionDurationMinutes),
    plays: decoratedRowsWithTotals,
    counted_rows: countedRowsChronological,
  };
}

function buildHourOfPowerShare(db, session, hopSummary) {
  if (!hopSummary) return null;

  const config = resolveHourOfPowerConfig(session);
  const endedAt = parseSqliteDateTime(session?.ended_at)
    || parseSqliteDateTime(session?.updated_at)
    || config.endsAt;
  const sessionDateLabel = config.warmupStartedAt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const sessionTimeRange = `${formatDisplayTime(config.warmupStartedAt)} - ${formatDisplayTime(endedAt)}`;
  const sessionDurationMinutes = Math.max(
    0,
    Math.round((endedAt.getTime() - config.warmupStartedAtMs) / 60000)
  );
  const sessionMachineName = hopSummary.counted_rows
    .map((row) => String(row?.machine_name || '').trim())
    .find(Boolean) || '';
  const rows = hopSummary.counted_rows.map((row) => {
    // Resolve the Shinsa-hosted jacket from the songs catalog (chart_id /
    // chart_path / jacket_url). applyChartMetadata only fills missing fields
    // and deliberately ignores background_url (the piugame CDN), so an empty
    // jacket_url means the catalog lacks the chart rather than papering over
    // it with an external image.
    const meta = applyChartMetadata(db, {
      song_title: String(row?.song_title || ''),
      mode: String(row?.mode || ''),
      level: toInt(row?.level),
      jacket_url: String(row?.jacket_url || ''),
    });
    return {
    song_title: String(row?.song_title || ''),
    mode: String(row?.mode || ''),
    level: toInt(row?.level),
    score: toInt(row?.score),
    grade: String(row?.hop_resolved_grade || row?.grade || ''),
    rating_points: toInt(row?.hop_rating_points_earned),
    jacket_url: String(meta?.jacket_url || row?.jacket_url || ''),
    replay_embed_url: String(row?.replay_embed_url || ''),
    replay_video_id: String(row?.replay_video_id || ''),
    replay_start_seconds: toInt(row?.replay_start_seconds),
    replay_end_seconds: toInt(row?.replay_end_seconds),
    perfect: toInt(row?.perfect),
    great: toInt(row?.great),
    good: toInt(row?.good),
    bad: toInt(row?.bad),
    miss: toInt(row?.miss),
    date_played: String(row?.date_played || ''),
    };
  });

  return {
    version: 1,
    shareType: 'hour_of_power',
    sessionId: String(session?.id || ''),
    sessionTitle: String(session?.title || ''),
    streamUrl: String(session?.stream_url || ''),
    generatedAt: formatSqliteDateTime(endedAt),
    sessionDateLabel,
    sessionTimeRange,
    sessionDurationMinutes,
    sessionDurationLabel: formatDurationLabel(sessionDurationMinutes),
    sessionMachineName,
    totalRatingPoints: toInt(hopSummary.total_rating_points),
    averageRatingPoints: toNumber(hopSummary.average_rating_points),
    averageLevel: toNumber(hopSummary.average_level),
    highestRatingPoints: toInt(hopSummary.highest_rating_points),
    lowestRatingPoints: toInt(hopSummary.lowest_rating_points),
    countedClearCount: toInt(hopSummary.counted_clear_count),
    completed: !!hopSummary.completed,
    leaderboardEligible: !!hopSummary.leaderboard_eligible,
    rows,
  };
}

module.exports = {
  DEFAULT_HOP_WARMUP_SECONDS,
  DEFAULT_HOP_WINDOW_SECONDS,
  HOP_SESSION_TYPE,
  LIVE_SESSION_TYPE,
  buildHourOfPowerShare,
  formatSqliteDateTime,
  isHourOfPowerSession,
  normalizeSessionType,
  parseSqliteDateTime,
  resolveHourOfPowerConfig,
  resolveHourOfPowerPhase,
  summarizeHourOfPower,
};
