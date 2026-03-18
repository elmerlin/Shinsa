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
}) {
  const id = String(chartId || '').trim();
  if (!id || !best) return null;

  const authorName = String(username || 'Player').trim() || 'Player';
  const score = Number(best?.score) || 0;
  const grade = compactText(best?.grade, 20);
  const chartLabel = formatChartLabel(chartTitle, mode, level);
  const parts = [chartLabel];

  if (score > 0) parts.push(formatScore(score));
  if (grade) parts.push(grade);

  if (targetScore > 0 && score > 0) {
    const delta = score - targetScore;
    parts.push(delta >= 0 ? `Beat target by ${delta.toLocaleString()}` : `Need +${Math.abs(delta).toLocaleString()}`);
  } else if (challengeKind === 'clear_chart') {
    parts.push(best?.is_stage_break ? 'No pass yet' : 'Pass on record');
  }

  return {
    kind: 'chart_compare',
    path: `/songs/chart/${id}`,
    title: `${authorName}'s current best`,
    subtitle: parts.filter(Boolean).join(' • '),
    buttonLabel: 'Open chart',
    songTitle: String(chartTitle || ''),
    mode: String(mode || ''),
    level: Number(level) || 0,
  };
}
