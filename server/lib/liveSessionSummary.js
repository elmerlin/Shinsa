const { calculateRatingPoints, gradeFromScore, normalizeGrade } = require('./titleProgress');

const PIU_SESSION_MET = 11.8;
const PIU_SONG_LENGTH_MINUTES = 2;
const DEFAULT_WEIGHT_KG = 70;
const SUMMARY_TOP_SONGS = 3;
const SUMMARY_PREVIEW_TOP_SONGS = 6;

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toPositiveNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'X';
}

function parsePlayedAt(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/[./]/g, '-');
  const ymd = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    const hour = parseInt(ymd[4] || '0', 10);
    const minute = parseInt(ymd[5] || '0', 10);
    const second = parseInt(ymd[6] || '0', 10);
    return new Date(year, month, day, hour, minute, second);
  }

  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function formatDurationLabel(totalMinutes) {
  const minutes = Math.max(0, toInt(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

function buildSessionCalorieEstimate(songCount, weightKgInput) {
  const songs = Math.max(0, toInt(songCount));
  const parsedWeight = toPositiveNumber(weightKgInput);
  const personalized = parsedWeight !== null;
  const weightKgUsed = Math.round((personalized ? parsedWeight : DEFAULT_WEIGHT_KG) * 10) / 10;
  const kcalPerMinute = (PIU_SESSION_MET * 3.5 * weightKgUsed) / 200;
  const kcalPerHour = Math.max(0, Math.round(kcalPerMinute * 60));
  const kcalPerSong = kcalPerMinute * PIU_SONG_LENGTH_MINUTES;
  const estimatedKcal = Math.max(0, Math.round(songs * kcalPerSong));

  return {
    estimatedKcal,
    kcalPerHour,
    weightKgUsed,
    personalized,
  };
}

function resolvePlayGrade(play) {
  const normalized = normalizeGrade(play?.grade || '');
  if (normalized) return normalized;
  return gradeFromScore(play?.score);
}

function sanitizeTopSong(play, rating = 0) {
  return {
    song_title: String(play?.song_title || ''),
    mode: String(play?.mode || ''),
    level: toInt(play?.level),
    score: toInt(play?.score),
    grade: String(resolvePlayGrade(play) || ''),
    rating: Math.max(0, toInt(rating)),
    over_top100_rank: toInt(play?.over_top100_rank),
    jacket_url: String(play?.jacket_url || play?.background_url || ''),
  };
}

function buildLiveSessionPostText(summary) {
  if (!summary) return '';

  const lines = [
    '🔴 **Shinsa Live Recap**',
    `🗓️ ${summary.sessionDateLabel}${summary.sessionTimeRange ? ` • ${summary.sessionTimeRange}` : ''}${summary.sessionDurationLabel ? ` • ${summary.sessionDurationLabel}` : ''}`,
    summary.streamUrl ? `📺 Stream: ${summary.streamUrl}` : '',
    summary.sessionMachineName ? `🕹️ Machine: **${summary.sessionMachineName}**` : '',
    `👀 Viewers: **${summary.viewerPeak || summary.viewerCount || 0} peak**${summary.messageCount ? ` • 💬 ${summary.messageCount} messages` : ''}${summary.interactions ? ` • 🤝 ${summary.interactions} interactions` : ''}`,
    `🎵 **${summary.songCount} songs** | 🏁 Clears: **${summary.clearCount}/${summary.songCount}** (${summary.clearRate}%)`,
    `📈 Avg level: **Lv.${summary.averageLevel.toFixed(1)}**`,
    summary.averageRating > 0 ? `⭐ Avg rating: **${summary.averageRating.toLocaleString()}**` : '',
    summary.averageScore > 0 ? `🎯 Avg score: **${summary.averageScore.toLocaleString()}**` : '',
    `🦶 Steps: **${summary.totalSteps.toLocaleString()}**`,
    `🔥 Estimated calories: **~${summary.estimatedKcal.toLocaleString()} kcal**`,
  ].filter(Boolean);

  return lines.join('\n');
}

function buildLiveSessionSummary(rows, userProfile = {}, extras = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (sourceRows.length === 0) return null;

  const normalizedRows = sourceRows
    .map((row) => {
      const score = toInt(row?.score);
      const level = toInt(row?.level);
      const rating = calculateRatingPoints(level, row?.grade, score);
      const playedAt = parsePlayedAt(row?.date_played);
      return {
        ...row,
        _score: score,
        _level: level,
        _rating: rating,
        _grade: resolvePlayGrade(row),
        _playedAt: playedAt,
      };
    })
    .sort((a, b) => {
      const aTime = a._playedAt ? a._playedAt.getTime() : 0;
      const bTime = b._playedAt ? b._playedAt.getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return toInt(b.id) - toInt(a.id);
    });

  let singleCount = 0;
  let doubleCount = 0;
  let otherCount = 0;
  let clearCount = 0;
  let scoredCount = 0;
  let scoreTotal = 0;
  let levelCount = 0;
  let levelTotal = 0;
  let ratingCount = 0;
  let ratingTotal = 0;
  let totalSteps = 0;
  const judgmentTotals = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };

  for (const row of normalizedRows) {
    if (row.mode === 'Single') singleCount += 1;
    else if (row.mode === 'Double') doubleCount += 1;
    else otherCount += 1;

    if (row._score > 0) {
      clearCount += 1;
      scoredCount += 1;
      scoreTotal += row._score;
    }

    if (row._level > 0) {
      levelCount += 1;
      levelTotal += row._level;
    }

    if (row._rating > 0) {
      ratingCount += 1;
      ratingTotal += row._rating;
    }

    const perfect = toInt(row?.perfect);
    const great = toInt(row?.great);
    const good = toInt(row?.good);
    const bad = toInt(row?.bad);
    const miss = toInt(row?.miss);
    totalSteps += perfect + great + good + bad + miss;
    judgmentTotals.perfect += perfect;
    judgmentTotals.great += great;
    judgmentTotals.good += good;
    judgmentTotals.bad += bad;
    judgmentTotals.miss += miss;
  }

  const songCount = normalizedRows.length;
  const clearRate = songCount > 0 ? Math.round((clearCount / songCount) * 100) : 0;
  const averageScore = scoredCount > 0 ? Math.round(scoreTotal / scoredCount) : 0;
  const averageLevel = levelCount > 0 ? Number((levelTotal / levelCount).toFixed(1)) : 0;
  const averageRating = ratingCount > 0 ? Math.round(ratingTotal / ratingCount) : 0;
  const perfectRate = totalSteps > 0 ? Math.round((judgmentTotals.perfect / totalSteps) * 100) : 0;
  const calorieEstimate = buildSessionCalorieEstimate(songCount, userProfile?.weight_kg);

  const topSongsByScore = normalizedRows
    .filter((row) => row._score > 0)
    .slice()
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return b._level - a._level;
    })
    .slice(0, SUMMARY_TOP_SONGS)
    .map((row) => sanitizeTopSong(row, row._rating));

  const topSongsByRating = normalizedRows
    .filter((row) => row._score > 0)
    .slice()
    .sort((a, b) => {
      if (b._rating !== a._rating) return b._rating - a._rating;
      return b._score - a._score;
    })
    .slice(0, SUMMARY_TOP_SONGS)
    .map((row) => sanitizeTopSong(row, row._rating));

  const topSongsByRatingPreview = normalizedRows
    .filter((row) => row._score > 0)
    .slice()
    .sort((a, b) => {
      if (b._rating !== a._rating) return b._rating - a._rating;
      return b._score - a._score;
    })
    .slice(0, SUMMARY_PREVIEW_TOP_SONGS)
    .map((row) => sanitizeTopSong(row, row._rating));

  const newest = normalizedRows[0]?._playedAt || null;
  const oldest = normalizedRows[normalizedRows.length - 1]?._playedAt || null;
  const sessionDateLabel = newest
    ? newest.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Live session';
  const sessionTimeRange = newest && oldest
    ? `${oldest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${newest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  const sessionDurationMinutes = newest && oldest
    ? Math.max(0, Math.round((newest.getTime() - oldest.getTime()) / 60000))
    : 0;
  const sessionDurationLabel = formatDurationLabel(sessionDurationMinutes);
  const sessionMachineName = normalizedRows
    .map((row) => String(row?.machine_name || '').trim())
    .find(Boolean) || '';

  const summary = {
    version: 1,
    sessionId: String(extras?.sessionId || ''),
    sessionDateLabel,
    sessionTimeRange,
    sessionDurationMinutes,
    sessionDurationLabel,
    sessionMachineName,
    sessionShoeLabel: '',
    songCount,
    clearCount,
    clearRate,
    totalSteps,
    estimatedKcal: calorieEstimate.estimatedKcal,
    estimatedKcalPerHour: calorieEstimate.kcalPerHour,
    calorieEstimatePersonalized: calorieEstimate.personalized,
    singleCount,
    doubleCount,
    otherCount,
    judgmentTotals,
    perfectRate,
    averageScore,
    averageLevel,
    averageRating,
    topSongsByScore,
    topSongsByRating,
    topSongsByRatingPreview,
    viewerCount: Math.max(0, toInt(extras?.viewerCount)),
    viewerPeak: Math.max(0, toInt(extras?.viewerPeak)),
    messageCount: Math.max(0, toInt(extras?.messageCount)),
    requestPlayCount: Math.max(0, toInt(extras?.requestPlayCount)),
    votedSongPlayCount: Math.max(0, toInt(extras?.votedSongPlayCount)),
    interactions: Math.max(0, toInt(extras?.interactions)),
    streamUrl: String(extras?.streamUrl || '').trim(),
    hostUsername: String(extras?.hostUsername || '').trim(),
  };

  summary.postText = buildLiveSessionPostText(summary);
  return summary;
}

module.exports = {
  buildLiveSessionSummary,
  buildLiveSessionPostText,
  formatDurationLabel,
  modeShort,
  parsePlayedAt,
};
