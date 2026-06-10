const { calculateRatingPoints, gradeFromScore, normalizeGrade } = require('./titleProgress');
const { calculatePlayLoad } = require('./trainingLoad');

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

function parseUtcSqliteDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function buildShoeLabel(row) {
  const make = String(row?.shoe_make || '').trim();
  const model = String(row?.shoe_model || '').trim();
  const colorway = String(row?.shoe_colorway || '').trim();
  const normalizedLabel = `${make} ${model}`.replace(/\s+/g, ' ').trim();
  const fallbackLabel = row?.shoe_id ? `Shoe #${toInt(row.shoe_id) || row.shoe_id}` : '';
  if (!normalizedLabel) return fallbackLabel;
  return colorway ? `${normalizedLabel} (${colorway})` : normalizedLabel;
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
    plate: String(play?.plate || ''),
    rating: Math.max(0, toInt(rating)),
    over_top100_rank: toInt(play?.over_top100_rank),
    jacket_url: String(play?.jacket_url || play?.background_url || ''),
    weekly_challenge_week_key: String(play?.weekly_challenge_week_key || ''),
    replay_embed_url: String(play?.replay_embed_url || ''),
    replay_video_id: String(play?.replay_video_id || ''),
    perfect: toInt(play?.perfect),
    great: toInt(play?.great),
    good: toInt(play?.good),
    bad: toInt(play?.bad),
    miss: toInt(play?.miss),
    max_combo: toInt(play?.max_combo),
    machine_name: String(play?.machine_name || ''),
    date_played: String(play?.date_played || play?.played_at_utc || ''),
    play_id: toInt(play?.id),
    user_id: String(play?.user_id || ''),
  };
}

function buildLiveSessionPostText(summary) {
  if (!summary) return '';

  const lines = [
    '🔴 **Shinsa Live Recap**',
    `🗓️ ${summary.sessionDateLabel}${summary.sessionTimeRange ? ` • ${summary.sessionTimeRange}` : ''}${summary.sessionDurationLabel ? ` • ${summary.sessionDurationLabel}` : ''}`,
    summary.streamUrl ? `📺 Stream: ${summary.streamUrl}` : '',
    summary.sessionMachineName ? `🕹️ Machine: **${summary.sessionMachineName}**` : '',
    summary.sessionShoeLabel ? `👟 Shoe: **${summary.sessionShoeLabel}**` : '',
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


// ---- Session heart-rate block --------------------------------------------
// Computed from the session's play rows (hr_* attached by getSessionPlays).
// Zones are % of the player's max HR — keep these bands in sync with
// mobile/lib/heartRate.ts (z0 below 68%, then 68/73/80/87/93).
const HR_ZONE_BANDS = [
  { key: 'z0', pctMin: 0, pctMax: 0.68 },
  { key: 'z1', pctMin: 0.68, pctMax: 0.73 },
  { key: 'z2', pctMin: 0.73, pctMax: 0.8 },
  { key: 'z3', pctMin: 0.8, pctMax: 0.87 },
  { key: 'z4', pctMin: 0.87, pctMax: 0.93 },
  { key: 'z5', pctMin: 0.93, pctMax: 10 },
];

function parseHrSeriesJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((v) => Math.round(Number(v) || 0)).filter((n) => n > 0 && n < 300) : [];
  } catch {
    return [];
  }
}

function hrZoneKeyFor(bpm, maxHr) {
  const pct = bpm / Math.max(1, maxHr);
  for (const band of HR_ZONE_BANDS) {
    if (pct >= band.pctMin && pct < band.pctMax) return band.key;
  }
  return 'z5';
}

function downsampleSeries(values, max) {
  if (values.length <= max) return values;
  const out = [];
  for (let i = 0; i < max; i += 1) {
    out.push(values[Math.round((i * (values.length - 1)) / (max - 1))]);
  }
  return out;
}

function buildSessionHrBlock(sortedRows) {
  // sortedRows arrive newest-first; play the session forward for the chart.
  const hrRows = sortedRows
    .filter((r) => toInt(r.hr_avg) > 0 || toInt(r.hr_peak) > 0)
    .slice()
    .reverse();
  if (hrRows.length === 0) return null;

  const maxHr = Math.max(190, ...hrRows.map((r) => toInt(r.hr_max)).filter((n) => n > 0));

  let stitched = [];
  let totalDuration = 0;
  let weightedAvgSum = 0;
  let weightSum = 0;
  let peak = 0;
  let peakRow = null;
  const zoneSeconds = {};
  const levelGroups = new Map();

  for (const row of hrRows) {
    const avg = toInt(row.hr_avg);
    const rowPeak = toInt(row.hr_peak);
    const series = parseHrSeriesJson(row.hr_series);
    const duration = toInt(row.hr_duration_s) || toInt(row.song_duration_s) || 115;

    totalDuration += duration;
    if (avg > 0) {
      weightedAvgSum += avg * duration;
      weightSum += duration;
    }
    if (rowPeak > peak) {
      peak = rowPeak;
      peakRow = row;
    }
    if (series.length > 0) {
      stitched = stitched.concat(series);
      const dwell = duration / series.length;
      for (const bpm of series) {
        const key = hrZoneKeyFor(bpm, maxHr);
        zoneSeconds[key] = (zoneSeconds[key] || 0) + dwell;
      }
    } else if (avg > 0) {
      const key = hrZoneKeyFor(avg, maxHr);
      zoneSeconds[key] = (zoneSeconds[key] || 0) + duration;
    }

    const modeKey = String(row.mode || '').trim().toLowerCase().startsWith('d') ? 'D' : 'S';
    const levelKey = `${modeKey}${toInt(row.level)}`;
    const group = levelGroups.get(levelKey) || { key: levelKey, mode: modeKey, level: toInt(row.level), plays: 0, avgSum: 0, peak: 0 };
    group.plays += 1;
    group.avgSum += avg;
    group.peak = Math.max(group.peak, rowPeak);
    levelGroups.set(levelKey, group);
  }

  for (const k of Object.keys(zoneSeconds)) zoneSeconds[k] = Math.round(zoneSeconds[k]);

  const perLevel = Array.from(levelGroups.values())
    .map((g) => ({ key: g.key, mode: g.mode, level: g.level, plays: g.plays, hr_avg: g.plays > 0 ? Math.round(g.avgSum / g.plays) : 0, hr_peak: g.peak }))
    .sort((a, b) => (a.level - b.level) || (a.mode === b.mode ? 0 : a.mode === 'S' ? -1 : 1));

  return {
    play_count: hrRows.length,
    hr_avg: weightSum > 0 ? Math.round(weightedAvgSum / weightSum) : 0,
    hr_peak: peak,
    peak_song: peakRow
      ? { song_title: String(peakRow.song_title || ''), mode: String(peakRow.mode || ''), level: toInt(peakRow.level), hr_peak: peak }
      : null,
    max_hr: maxHr,
    zone_seconds: zoneSeconds,
    per_level: perLevel,
    series: downsampleSeries(stitched, 120),
    duration_s: Math.round(totalDuration),
  };
}

function buildLiveSessionSummary(rows, userProfile = {}, extras = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (sourceRows.length === 0) return null;

  const normalizedRows = sourceRows
    .map((row) => {
      const score = toInt(row?.score);
      const level = toInt(row?.level);
      const rating = calculateRatingPoints(level, row?.grade, score);
      const playedAt = row?.played_at_utc
        ? parseUtcSqliteDateTime(row.played_at_utc)
        : parsePlayedAt(row?.date_played);
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
  let sessionTrainingLoad = 0;
  const judgmentTotals = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
  const shoeCounts = new Map();

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

    sessionTrainingLoad += calculatePlayLoad(row._level, row._grade || row.grade, row._score);

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

    const shoeLabel = buildShoeLabel(row);
    if (shoeLabel) {
      shoeCounts.set(shoeLabel, (shoeCounts.get(shoeLabel) || 0) + 1);
    }
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
  const topShoe = Array.from(shoeCounts.entries()).sort((a, b) => b[1] - a[1])[0] || null;
  const sessionShoeLabel = topShoe
    ? (shoeCounts.size > 1 ? `${topShoe[0]} (+${shoeCounts.size - 1} more)` : topShoe[0])
    : '';

  const summary = {
    version: 1,
    sessionId: String(extras?.sessionId || ''),
    sessionTitle: String(extras?.sessionTitle || '').trim(),
    participantRole: String(extras?.participantRole || '').trim(),
    sessionDateLabel,
    sessionTimeRange,
    sessionDurationMinutes,
    sessionDurationLabel,
    sessionMachineName,
    sessionShoeLabel,
    songCount,
    clearCount,
    clearRate,
    totalSteps,
    trainingLoad: sessionTrainingLoad,
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
    hr: buildSessionHrBlock(normalizedRows),
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
  parseUtcSqliteDateTime,
};
