function compactText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatChartLabel(songTitle, mode, level) {
  const title = compactText(songTitle, 80);
  const modeLabel = String(mode || '').trim();
  const levelValue = Number(level);
  const chartLabel = modeLabel && Number.isFinite(levelValue) && levelValue > 0
    ? `${modeLabel}${levelValue}`
    : modeLabel;

  if (title && chartLabel) return `${title} • ${chartLabel}`;
  return title || chartLabel || 'Chart';
}

function formatScore(score) {
  const numeric = Number(score);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toLocaleString() : '';
}

function formatDelta(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `+${numeric.toLocaleString()}` : '';
}

function buildCompareOutcome({ best, targetScore = 0, challengeKind = '' }) {
  if (!best || typeof best !== 'object') {
    return {
      statusKind: 'shared_best',
      statusLabel: 'Shared current best',
    };
  }

  const score = Number(best.score) || 0;
  const normalizedChallengeKind = String(challengeKind || '').trim().toLowerCase();
  const normalizedTargetScore = Number(targetScore) || 0;

  if ((normalizedChallengeKind === 'beat_score' || normalizedTargetScore > 0) && score > 0) {
    if (normalizedTargetScore > 0) {
      const delta = score - normalizedTargetScore;
      if (delta >= 0) {
        return {
          statusKind: 'beat_target',
          statusLabel: delta > 0 ? `Beat target by ${delta.toLocaleString()}` : 'Matched the target',
        };
      }
      return {
        statusKind: 'chasing_target',
        statusLabel: `Need +${Math.abs(delta).toLocaleString()}`,
      };
    }

    return {
      statusKind: 'shared_best',
      statusLabel: 'Shared current best',
    };
  }

  if (normalizedChallengeKind === 'clear_chart') {
    return best.is_stage_break
      ? {
        statusKind: 'still_breaking',
        statusLabel: 'Still stage breaking',
      }
      : {
        statusKind: 'pass_earned',
        statusLabel: 'Pass earned',
      };
  }

  return {
    statusKind: 'shared_best',
    statusLabel: 'Shared current best',
  };
}

function formatLeadClearLabel(clear) {
  if (!clear || typeof clear !== 'object') return 'New clear';
  if (String(clear.entry_type || '').trim().toLowerCase() === 'title_unlock') {
    return compactText(clear.title_name || clear.song_title || 'New title unlock', 90);
  }
  return formatChartLabel(clear.song_title, clear.mode, clear.level);
}

function pickUpscoreChallengeEntry(rows) {
  return rows.reduce((best, entry) => {
    if (!entry) return best;
    if (!best) return entry;

    const bestLevel = Number(best.level) || 0;
    const entryLevel = Number(entry.level) || 0;
    if (entryLevel !== bestLevel) return entryLevel > bestLevel ? entry : best;

    const bestScore = Number(best.new_score) || 0;
    const entryScore = Number(entry.new_score) || 0;
    if (entryScore !== bestScore) return entryScore > bestScore ? entry : best;

    const bestGain = (Number(best.new_score) || 0) - (Number(best.old_score) || 0);
    const entryGain = (Number(entry.new_score) || 0) - (Number(entry.old_score) || 0);
    return entryGain > bestGain ? entry : best;
  }, null);
}

function pickClearChallengeEntry(rows) {
  const playableRows = rows.filter((entry) => String(entry?.entry_type || '').trim().toLowerCase() !== 'title_unlock');
  if (playableRows.length === 0) return null;

  return playableRows.reduce((best, entry) => {
    if (!entry) return best;
    if (!best) return entry;

    const bestLevel = Number(best.level) || 0;
    const entryLevel = Number(entry.level) || 0;
    if (entryLevel !== bestLevel) return entryLevel > bestLevel ? entry : best;

    const bestScore = Number(best.score) || 0;
    const entryScore = Number(entry.score) || 0;
    return entryScore > bestScore ? entry : best;
  }, null);
}

export function buildPostLinkShare({
  postId,
  username,
  text,
  shareType = '',
}) {
  const id = String(postId || '').trim();
  if (!id) return null;

  const authorName = String(username || 'Player').trim() || 'Player';
  const normalizedShareType = String(shareType || '').trim().toLowerCase();
  const title = normalizedShareType === 'hour_of_power'
    ? `${authorName}'s Hour of Power recap`
    : normalizedShareType === 'session_share'
      ? `${authorName}'s session share`
      : `${authorName}'s post`;

  return {
    kind: 'post',
    path: `/post/${id}`,
    title,
    subtitle: compactText(text, 140) || 'Open this post on Shinsa.',
    buttonLabel: 'Open post',
  };
}

export function buildLiveSessionLinkShare({
  liveId,
  title,
  hostUsername,
  isHopSession = false,
  status = '',
}) {
  const id = String(liveId || '').trim();
  if (!id) return null;

  const hostLabel = String(hostUsername || '').trim();
  const sessionTitle = String(title || '').trim()
    || (hostLabel ? `${hostLabel}'s live session` : 'Shinsa Live session');
  const statusLabel = String(status || '').trim().toLowerCase();
  const baseSubtitle = isHopSession
    ? (hostLabel ? `Hour of Power live room hosted by ${hostLabel}` : 'Hour of Power live room')
    : (hostLabel ? `Live room hosted by ${hostLabel}` : 'Shinsa Live room');

  return {
    kind: 'live_session',
    path: `/live/${id}`,
    title: sessionTitle,
    subtitle: statusLabel ? `${baseSubtitle} • ${statusLabel}` : baseSubtitle,
    buttonLabel: isHopSession ? 'Open HoP room' : 'Open room',
  };
}

export function buildUpscoreLinkShare({
  upscoreId,
  username,
  upscores,
}) {
  const id = String(upscoreId || '').trim();
  if (!id) return null;

  const rows = Array.isArray(upscores) ? upscores.filter(Boolean) : [];
  const authorName = String(username || 'Player').trim() || 'Player';
  if (rows.length === 0) {
    return {
      kind: 'upscore',
      path: `/upscore/${id}`,
      title: `${authorName}'s upscore`,
      subtitle: 'Open this upscore on Shinsa.',
      buttonLabel: 'Open upscore',
      songTitle: '',
      mode: '',
      level: 0,
      targetScore: 0,
    };
  }

  if (rows.length === 1) {
    const [entry] = rows;
    const gainLabel = formatDelta((Number(entry?.new_score) || 0) - (Number(entry?.old_score) || 0));
    const oldScore = formatScore(entry?.old_score);
    const newScore = formatScore(entry?.new_score);
    const scoreLabel = oldScore && newScore ? `${oldScore} -> ${newScore}` : newScore || oldScore;

    return {
      kind: 'upscore',
      path: `/upscore/${id}`,
      title: `${authorName}'s upscore`,
      subtitle: [
        formatChartLabel(entry?.song_title, entry?.mode, entry?.level),
        scoreLabel,
        gainLabel,
      ].filter(Boolean).join(' • '),
      buttonLabel: 'Open upscore',
      songTitle: String(entry?.song_title || ''),
      mode: String(entry?.mode || ''),
      level: Number(entry?.level) || 0,
      targetScore: Number(entry?.new_score) || 0,
    };
  }

  const bestGainEntry = rows.reduce((best, entry) => {
    const gain = (Number(entry?.new_score) || 0) - (Number(entry?.old_score) || 0);
    if (!best) return { entry, gain };
    return gain > best.gain ? { entry, gain } : best;
  }, null);

  return {
    kind: 'upscore',
    path: `/upscore/${id}`,
    title: `${authorName}'s ${rows.length} upscores`,
    subtitle: bestGainEntry?.entry
      ? `Best gain ${formatDelta(bestGainEntry.gain) || 'posted'} on ${formatChartLabel(bestGainEntry.entry.song_title, bestGainEntry.entry.mode, bestGainEntry.entry.level)}`
      : `${rows.length} charts improved`,
    buttonLabel: 'Open upscore',
    songTitle: String(bestGainEntry?.entry?.song_title || ''),
    mode: String(bestGainEntry?.entry?.mode || ''),
    level: Number(bestGainEntry?.entry?.level) || 0,
    targetScore: Number(bestGainEntry?.entry?.new_score) || 0,
  };
}

export function buildScoreSnapshotLinkShare({
  kind = 'upscore',
  sourceId,
  username,
  avatar = '',
  score,
  path = '',
  chartPath = '',
  jacketUrl = '',
}) {
  const requestedKind = String(kind || '').trim().toLowerCase();
  const normalizedKind = requestedKind === 'clear'
    ? 'clear'
    : requestedKind === 'score_snapshot'
      ? 'score_snapshot'
      : 'upscore';
  const id = String(sourceId || '').trim();
  const resolvedPath = String(path || (id ? `/${normalizedKind}/${id}` : '')).trim();
  if (!resolvedPath) return null;

  const row = score && typeof score === 'object' ? score : {};
  const authorName = String(username || row.username || row.playerName || 'Player').trim() || 'Player';
  const songTitle = String(row.song_title || row.songTitle || '').trim();
  const mode = String(row.mode || '').trim();
  const level = Number(row.level) || 0;
  const displayScore = Number(row.new_score ?? row.score) || 0;
  const oldScore = Number(row.old_score) || 0;
  const delta = Number.isFinite(Number(row.scoreDelta))
    ? Number(row.scoreDelta)
    : (displayScore > 0 && oldScore > 0 ? displayScore - oldScore : 0);
  const grade = compactText(row.new_grade || row.grade, 20);
  const playedAt = String(row.date_played || row.playedAt || '').trim();

  return {
    kind: normalizedKind,
    path: resolvedPath,
    chartPath: String(chartPath || '').trim(),
    title: `${authorName}'s ${normalizedKind === 'upscore' ? 'score' : 'clear'}`,
    subtitle: [
      formatChartLabel(songTitle, mode, level),
      grade || (row.is_stage_break ? 'Stage break' : ''),
      delta > 0 ? formatDelta(delta) : '',
    ].filter(Boolean).join(' • '),
    buttonLabel: normalizedKind === 'upscore'
      ? 'Open upscore'
      : normalizedKind === 'clear'
        ? 'Open clear'
        : 'Open chart',
    songTitle,
    mode,
    level,
    score: displayScore,
    grade,
    isStageBreak: !!row.is_stage_break,
    targetScore: displayScore,
    playerName: authorName,
    playerAvatar: String(avatar || row.playerAvatar || row.avatar || '').trim(),
    playedAt,
    jacketUrl: String(jacketUrl || row._jacketUrl || row.jacket_url || row.background_url || '').trim(),
    oldScore,
    oldGrade: compactText(row.old_grade, 20),
    scoreDelta: delta,
    overTop100Rank: Number(row.over_top100_rank ?? row.overTop100Rank) || 0,
    plate: compactText(row.plate, 20),
    perfect: Number(row.perfect) || 0,
    great: Number(row.great) || 0,
    good: Number(row.good) || 0,
    bad: Number(row.bad) || 0,
    miss: Number(row.miss) || 0,
  };
}

export function buildClearLinkShare({
  clearId,
  username,
  clears,
}) {
  const id = String(clearId || '').trim();
  if (!id) return null;

  const rows = Array.isArray(clears) ? clears.filter(Boolean) : [];
  const authorName = String(username || 'Player').trim() || 'Player';
  if (rows.length === 0) {
    return {
      kind: 'clear',
      path: `/clear/${id}`,
      title: `${authorName}'s new clear`,
      subtitle: 'Open this clear on Shinsa.',
      buttonLabel: 'Open clear',
      songTitle: '',
      mode: '',
      level: 0,
      targetScore: 0,
    };
  }

  const allTitleUnlocks = rows.every((entry) => String(entry?.entry_type || '').trim().toLowerCase() === 'title_unlock');
  if (rows.length === 1) {
    const [entry] = rows;
    return {
      kind: 'clear',
      path: `/clear/${id}`,
      title: allTitleUnlocks ? `${authorName}'s title unlock` : `${authorName}'s new clear`,
      subtitle: [
        formatLeadClearLabel(entry),
        compactText(entry?.grade, 24),
        formatScore(entry?.score),
      ].filter(Boolean).join(' • '),
      buttonLabel: 'Open clear',
      songTitle: String(entry?.song_title || ''),
      mode: String(entry?.mode || ''),
      level: Number(entry?.level) || 0,
      targetScore: Number(entry?.score) || 0,
    };
  }

  const leadLabel = formatLeadClearLabel(rows[0]);
  return {
    kind: 'clear',
    path: `/clear/${id}`,
    title: allTitleUnlocks ? `${authorName}'s ${rows.length} title unlocks` : `${authorName}'s ${rows.length} new clears`,
    subtitle: `${leadLabel} + ${rows.length - 1} more`,
    buttonLabel: 'Open clear',
    songTitle: String(rows[0]?.song_title || ''),
    mode: String(rows[0]?.mode || ''),
    level: Number(rows[0]?.level) || 0,
    targetScore: Number(rows[0]?.score) || 0,
  };
}

export function buildUpscoreChallengeCard({
  upscoreId,
  username,
  upscores,
}) {
  const id = String(upscoreId || '').trim();
  if (!id) return null;

  const rows = Array.isArray(upscores) ? upscores.filter(Boolean) : [];
  const entry = pickUpscoreChallengeEntry(rows);
  if (!entry) return null;

  const authorName = String(username || 'Player').trim() || 'Player';
  const targetScore = Number(entry?.new_score) || 0;
  const gainLabel = formatDelta(targetScore - (Number(entry?.old_score) || 0));
  const detailBits = [];
  if (compactText(entry?.new_grade, 20)) detailBits.push(compactText(entry.new_grade, 20));
  if (gainLabel) detailBits.push(gainLabel);
  if (rows.length > 1) detailBits.push(`Picked from ${rows.length} upscores`);

  return {
    kind: 'beat_score',
    sourceKind: 'upscore',
    sourceId: id,
    path: `/upscore/${id}`,
    title: 'Beat this score',
    subtitle: `${authorName} challenged you on ${formatChartLabel(entry?.song_title, entry?.mode, entry?.level)}`,
    targetLabel: targetScore > 0 ? `Target ${formatScore(targetScore)}` : 'Beat this run',
    detailLabel: detailBits.join(' • '),
    buttonLabel: 'Open upscore',
    songTitle: String(entry?.song_title || ''),
    mode: String(entry?.mode || ''),
    level: Number(entry?.level) || 0,
    targetScore,
    targetGrade: String(entry?.new_grade || ''),
    originUsername: authorName,
  };
}

export function buildClearChallengeCard({
  clearId,
  username,
  clears,
}) {
  const id = String(clearId || '').trim();
  if (!id) return null;

  const rows = Array.isArray(clears) ? clears.filter(Boolean) : [];
  const entry = pickClearChallengeEntry(rows);
  if (!entry) return null;

  const authorName = String(username || 'Player').trim() || 'Player';
  const chartLabel = formatChartLabel(entry?.song_title, entry?.mode, entry?.level);
  const detailBits = [];
  if (compactText(entry?.grade, 20)) detailBits.push(compactText(entry.grade, 20));
  if ((Number(entry?.score) || 0) > 0) detailBits.push(formatScore(entry.score));
  if (rows.length > 1) detailBits.push(`Picked from ${rows.length} clears`);

  return {
    kind: 'clear_chart',
    sourceKind: 'clear',
    sourceId: id,
    path: `/clear/${id}`,
    title: 'Clear this chart',
    subtitle: `${authorName} challenged you on ${chartLabel}`,
    targetLabel: chartLabel,
    detailLabel: detailBits.join(' • '),
    buttonLabel: 'Open clear',
    songTitle: String(entry?.song_title || ''),
    mode: String(entry?.mode || ''),
    level: Number(entry?.level) || 0,
    targetScore: Number(entry?.score) || 0,
    targetGrade: String(entry?.grade || ''),
    originUsername: authorName,
  };
}

export function buildChartCompareLinkShare({
  chartId,
  chartTitle,
  mode,
  level,
  username,
  best,
  targetScore = 0,
  challengeKind = '',
  sourceMessageId = '',
}) {
  const id = String(chartId || '').trim();
  if (!id || !best) return null;

  const authorName = String(username || 'Player').trim() || 'Player';
  const score = Number(best?.score) || 0;
  const grade = compactText(best?.grade, 20);
  const chartLabel = formatChartLabel(chartTitle, mode, level);
  const parts = [chartLabel];
  const outcome = buildCompareOutcome({ best, targetScore, challengeKind });

  if (score > 0) parts.push(formatScore(score));
  if (grade) parts.push(grade);

  return {
    kind: 'chart_compare',
    path: `/songs/chart/${id}`,
    title: `${authorName}'s current best`,
    subtitle: parts.filter(Boolean).join(' • ') || outcome.statusLabel,
    buttonLabel: 'Open chart',
    songTitle: String(chartTitle || ''),
    mode: String(mode || ''),
    level: Number(level) || 0,
    score,
    grade,
    isStageBreak: !!best?.is_stage_break,
    targetScore: Number(targetScore) || 0,
    challengeKind: String(challengeKind || '').trim(),
    sourceMessageId: String(sourceMessageId || '').trim(),
    statusKind: outcome.statusKind,
    statusLabel: outcome.statusLabel,
  };
}

export function buildRematchChallengeCard({
  chartId,
  chartTitle,
  mode,
  level,
  challengerName,
  targetScore = 0,
  targetGrade = '',
}) {
  const id = String(chartId || '').trim();
  if (!id) return null;

  const challenger = String(challengerName || 'Player').trim() || 'Player';
  const normalizedTargetScore = Number(targetScore) || 0;
  const normalizedTargetGrade = compactText(targetGrade, 20);
  const chartLabel = formatChartLabel(chartTitle, mode, level);
  const detailBits = [];

  if (normalizedTargetGrade) detailBits.push(normalizedTargetGrade);
  if (normalizedTargetScore > 0) detailBits.push(`Target ${formatScore(normalizedTargetScore)}`);

  return {
    kind: 'beat_score',
    path: `/songs/chart/${id}`,
    title: 'Rematch on this chart',
    subtitle: `${challenger} set a new target on ${chartLabel}`,
    targetLabel: normalizedTargetScore > 0 ? `Target ${formatScore(normalizedTargetScore)}` : chartLabel,
    detailLabel: detailBits.join(' • '),
    buttonLabel: 'Open chart',
    songTitle: String(chartTitle || ''),
    mode: String(mode || ''),
    level: Number(level) || 0,
    targetScore: normalizedTargetScore,
    targetGrade: normalizedTargetGrade,
    originUsername: challenger,
  };
}

export function buildChallengeLifecycleCard({
  challengeCard,
  actorName,
  statusKind,
  sourceMessageId = '',
}) {
  const source = challengeCard && typeof challengeCard === 'object' ? challengeCard : null;
  if (!source) return null;

  const normalizedStatusKind = String(statusKind || '').trim().toLowerCase();
  if (normalizedStatusKind !== 'accepted' && normalizedStatusKind !== 'expired') {
    return null;
  }

  const actor = String(actorName || 'Player').trim() || 'Player';
  const chartLabel = formatChartLabel(source.songTitle, source.mode, source.level);
  const isAccepted = normalizedStatusKind === 'accepted';

  return {
    kind: source.kind || 'beat_score',
    sourceKind: source.sourceKind || '',
    sourceId: String(source.sourceId || '').trim(),
    path: source.path || '',
    chartPath: source.chartPath || '',
    title: isAccepted ? 'Challenge accepted' : 'Challenge expired',
    subtitle: isAccepted
      ? `${actor} accepted the challenge on ${chartLabel}`
      : `${actor} closed the challenge on ${chartLabel}`,
    targetLabel: source.targetLabel || chartLabel,
    detailLabel: source.detailLabel || '',
    buttonLabel: source.buttonLabel || 'Open challenge',
    songTitle: String(source.songTitle || ''),
    mode: String(source.mode || ''),
    level: Number(source.level) || 0,
    targetScore: Number(source.targetScore) || 0,
    targetGrade: String(source.targetGrade || ''),
    originUsername: String(source.originUsername || ''),
    sourceMessageId: String(sourceMessageId || '').trim(),
    statusKind: normalizedStatusKind,
    statusLabel: isAccepted ? `Accepted by ${actor}` : `Expired by ${actor}`,
  };
}
