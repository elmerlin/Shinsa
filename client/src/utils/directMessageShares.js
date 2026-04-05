import { parseYouTubeUrl } from './youtube';

function compactText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function parseAchievementBadgePost(content, images) {
  if (!Array.isArray(images) || images.length !== 1) return null;
  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) return null;

  const lines = trimmedContent
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const headingMatch = lines[0].match(/^New badge unlocked:\s*(.+)$/i);
  if (!headingMatch) return null;

  return {
    badgeName: headingMatch[1].trim() || 'New badge',
    supportingCopy: lines.slice(1).join('\n\n').trim(),
    image: String(images[0] || '').trim(),
  };
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

function normalizePreviewItem(entry, kind = 'clear') {
  if (!entry || typeof entry !== 'object') return null;

  const resolvedKind = String(kind || '').trim().toLowerCase() === 'upscore' ? 'upscore' : 'clear';
  const score = resolvedKind === 'upscore'
    ? Number(entry.new_score ?? entry.score) || 0
    : Number(entry.score) || 0;
  const oldScore = resolvedKind === 'upscore' ? Number(entry.old_score) || 0 : 0;
  const scoreDelta = resolvedKind === 'upscore'
    ? (Number(entry.scoreDelta) || Math.max(0, score - oldScore))
    : 0;

  const item = {
    songTitle: compactText(entry.song_title || entry.songTitle, 80),
    mode: String(entry.mode || '').trim(),
    level: Number(entry.level) || 0,
    score,
    grade: compactText(
      resolvedKind === 'upscore'
        ? (entry.new_grade || entry.grade)
        : entry.grade,
      20
    ),
    plate: compactText(entry.plate, 20),
    jacketUrl: String(entry._jacketUrl || entry.jacket_url || entry.background_url || '').trim(),
    scoreDelta,
  };

  return item.songTitle || item.score > 0 || item.grade || item.plate || item.jacketUrl ? item : null;
}

function buildPreviewItems(rows, kind = 'clear') {
  const normalizedKind = String(kind || '').trim().toLowerCase() === 'upscore' ? 'upscore' : 'clear';
  const sourceRows = normalizedKind === 'clear'
    ? (() => {
        const playable = rows.filter((entry) => String(entry?.entry_type || '').trim().toLowerCase() !== 'title_unlock');
        return playable.length > 0 ? playable : rows;
      })()
    : rows;

  const previewItems = sourceRows
    .map((entry) => normalizePreviewItem(entry, normalizedKind))
    .filter(Boolean)

  return {
    previewItems,
    totalItemCount: sourceRows.length,
    extraItemCount: Math.max(0, sourceRows.length - 3),
  };
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
    return compactText(clear.title_name || clear.song_title || 'New skill title unlock', 90);
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
  images = [],
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
  const achievementBadge = parseAchievementBadgePost(text, images);

  return {
    kind: 'post',
    path: `/post/${id}`,
    title: achievementBadge ? `${authorName}'s achievement` : title,
    subtitle: achievementBadge
      ? compactText(achievementBadge.supportingCopy, 160) || `${achievementBadge.badgeName} unlocked on Shinsa.`
      : (compactText(text, 140) || 'Open this post on Shinsa.'),
    buttonLabel: 'Open post',
    postType: achievementBadge ? 'achievement_badge' : '',
    achievementBadgeName: achievementBadge?.badgeName || '',
    achievementSupportingCopy: achievementBadge?.supportingCopy || '',
    previewImage: achievementBadge?.image || '',
  };
}

export function buildLiveSessionLinkShare({
  liveId,
  title,
  hostUsername,
  hostAvatar = '',
  hostSkillTitle = '',
  isHopSession = false,
  isUnlisted = false,
  status = '',
  youtubeVideoId = '',
  streamUrl = '',
}) {
  const id = String(liveId || '').trim();
  if (!id) return null;

  const hostLabel = String(hostUsername || '').trim();
  const statusText = String(status || '').trim().toLowerCase();
  const resolvedVideoId = String(youtubeVideoId || '').trim() || parseYouTubeUrl(streamUrl).videoId;
  const sessionTitle = String(title || '').trim()
    || (hostLabel ? `${hostLabel}'s live session` : 'Shinsa Live session');
  const contextLabel = isHopSession ? 'Hour of Power' : 'Shinsa Live';
  const statusLabel = isUnlisted
    ? 'Invite only'
    : (statusText === 'live' ? 'Live now' : (statusText ? compactText(statusText, 40) : 'Live room'));
  const baseSubtitle = isUnlisted
    ? (hostLabel ? `Share this room directly to invite people into ${hostLabel}'s session.` : 'Share this room directly to invite people in.')
    : (hostLabel ? `Join ${hostLabel}'s live room on Shinsa.` : 'Join this live room on Shinsa.');

  return {
    kind: 'live_session',
    path: `/live/${id}`,
    title: sessionTitle,
    subtitle: baseSubtitle,
    buttonLabel: isHopSession ? 'Open HoP room' : 'Open room',
    contextLabel,
    statusLabel,
    liveSessionType: isHopSession ? 'hop' : 'live',
    isUnlisted,
    playerName: hostLabel,
    playerAvatar: String(hostAvatar || '').trim(),
    playerSkillTitle: String(hostSkillTitle || '').trim(),
    playerRoleLabel: 'Host',
    youtubeVideoId: resolvedVideoId,
    previewImage: resolvedVideoId ? `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg` : '',
  };
}

export function buildUpscoreLinkShare({
  upscoreId,
  username,
  avatar = '',
  skillTitle = '',
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
    const newScoreNum = Number(entry?.new_score) || 0;
    const oldScoreNum = Number(entry?.old_score) || 0;
    const delta = newScoreNum > 0 && oldScoreNum > 0 ? newScoreNum - oldScoreNum : 0;
    const gainLabel = formatDelta(delta);
    const oldScoreLabel = formatScore(entry?.old_score);
    const newScoreLabel = formatScore(entry?.new_score);
    const scoreLabel = oldScoreLabel && newScoreLabel ? `${oldScoreLabel} -> ${newScoreLabel}` : newScoreLabel || oldScoreLabel;

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
      targetScore: newScoreNum,
      score: newScoreNum,
      oldScore: oldScoreNum,
      grade: compactText(entry?.new_grade || entry?.grade, 20),
      oldGrade: compactText(entry?.old_grade, 20),
      scoreDelta: delta,
      jacketUrl: String(entry?.background_url || entry?._jacketUrl || '').trim(),
      perfect: Number(entry?.perfect) || 0,
      great: Number(entry?.great) || 0,
      good: Number(entry?.good) || 0,
      bad: Number(entry?.bad) || 0,
      miss: Number(entry?.miss) || 0,
      plate: String(entry?.plate || '').trim(),
      overTop100Rank: Number(entry?.over_top100_rank) || 0,
      isStageBreak: !!entry?.is_stage_break,
      playerName: authorName,
      playerAvatar: String(avatar || '').trim(),
      playerSkillTitle: String(skillTitle || '').trim(),
      playedAt: String(entry?.played_at_utc || entry?.playedAtUtc || entry?.date_played || '').trim(),
    };
  }

  const bestGainEntry = rows.reduce((best, entry) => {
    const gain = (Number(entry?.new_score) || 0) - (Number(entry?.old_score) || 0);
    if (!best) return { entry, gain };
    return gain > best.gain ? { entry, gain } : best;
  }, null);
  const { previewItems, totalItemCount, extraItemCount } = buildPreviewItems(rows, 'upscore');

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
    previewItems,
    totalItemCount,
    extraItemCount,
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
  const playedAt = String(row.played_at_utc || row.playedAtUtc || row.date_played || row.playedAt || '').trim();
  const summaryLabel = normalizedKind === 'clear' ? 'clear' : 'score';
  const replayUrl = String(
    row.replayUrl
    || row.replay_url
    || row.replayEmbedUrl
    || row.replay_embed_url
    || ''
  ).trim();

  return {
    kind: normalizedKind,
    path: resolvedPath,
    chartPath: String(chartPath || '').trim(),
    title: `${authorName}'s ${summaryLabel}`,
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
    playerSkillTitle: String(row.playerSkillTitle || row.skill_title || row.skillTitle || '').trim(),
    playerRoleLabel: String(row.playerRoleLabel || row.roleLabel || '').trim(),
    contextLabel: String(row.contextLabel || row.context_label || '').trim(),
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
    replayUrl,
    replayVideoId: String(row.replayVideoId || row.replay_video_id || '').trim(),
    replayStartSeconds: Number(row.replayStartSeconds ?? row.replay_start_seconds) || 0,
    replayEndSeconds: Number(row.replayEndSeconds ?? row.replay_end_seconds) || 0,
  };
}

export function buildClearLinkShare({
  clearId,
  username,
  avatar = '',
  skillTitle = '',
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
    const scoreNum = Number(entry?.score) || 0;
    return {
      kind: 'clear',
      path: `/clear/${id}`,
      title: allTitleUnlocks ? `${authorName}'s skill title unlock` : `${authorName}'s new clear`,
      subtitle: [
        formatLeadClearLabel(entry),
        compactText(entry?.grade, 24),
        formatScore(entry?.score),
      ].filter(Boolean).join(' • '),
      buttonLabel: 'Open clear',
      songTitle: String(entry?.song_title || ''),
      mode: String(entry?.mode || ''),
      level: Number(entry?.level) || 0,
      targetScore: scoreNum,
      score: scoreNum,
      grade: compactText(entry?.grade, 20),
      jacketUrl: String(entry?.background_url || entry?._jacketUrl || '').trim(),
      perfect: Number(entry?.perfect) || 0,
      great: Number(entry?.great) || 0,
      good: Number(entry?.good) || 0,
      bad: Number(entry?.bad) || 0,
      miss: Number(entry?.miss) || 0,
      plate: String(entry?.plate || '').trim(),
      overTop100Rank: Number(entry?.over_top100_rank) || 0,
      isStageBreak: !!entry?.is_stage_break,
      playerName: authorName,
      playerAvatar: String(avatar || '').trim(),
      playerSkillTitle: String(skillTitle || '').trim(),
      playedAt: String(entry?.played_at_utc || entry?.playedAtUtc || entry?.date_played || '').trim(),
    };
  }

  const leadLabel = formatLeadClearLabel(rows[0]);
  const { previewItems, totalItemCount, extraItemCount } = buildPreviewItems(rows, 'clear');
  return {
    kind: 'clear',
    path: `/clear/${id}`,
    title: allTitleUnlocks ? `${authorName}'s ${rows.length} skill title unlocks` : `${authorName}'s ${rows.length} new clears`,
    subtitle: `${leadLabel} + ${rows.length - 1} more`,
    buttonLabel: 'Open clear',
    songTitle: String(rows[0]?.song_title || ''),
    mode: String(rows[0]?.mode || ''),
    level: Number(rows[0]?.level) || 0,
    targetScore: Number(rows[0]?.score) || 0,
    previewItems,
    totalItemCount,
    extraItemCount,
  };
}

export function buildUpscoreChallengeCard({
  upscoreId,
  username,
  upscores,
  selectedEntry = null,
}) {
  const id = String(upscoreId || '').trim();
  if (!id) return null;

  const rows = Array.isArray(upscores) ? upscores.filter(Boolean) : [];
  const entry = selectedEntry && typeof selectedEntry === 'object' ? selectedEntry : pickUpscoreChallengeEntry(rows);
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
  selectedEntry = null,
}) {
  const id = String(clearId || '').trim();
  if (!id) return null;

  const rows = Array.isArray(clears) ? clears.filter(Boolean) : [];
  const entry = selectedEntry && typeof selectedEntry === 'object' ? selectedEntry : pickClearChallengeEntry(rows);
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

export function buildUpscoreChallengeOptions({
  upscoreId,
  username,
  upscores,
}) {
  const id = String(upscoreId || '').trim();
  if (!id) return [];

  const rows = Array.isArray(upscores) ? upscores.filter(Boolean) : [];
  return rows.map((entry, index) => {
    const challengeCard = buildUpscoreChallengeCard({
      upscoreId: id,
      username,
      upscores: rows,
      selectedEntry: entry,
    });
    if (!challengeCard) return null;

    const targetScore = Number(entry?.new_score) || 0;
    const scoreGain = targetScore - (Number(entry?.old_score) || 0);
    return {
      id: `upscore-${id}-${index}-${String(entry?.song_title || '').trim()}-${String(entry?.mode || '').trim()}-${Number(entry?.level) || 0}`,
      title: formatChartLabel(entry?.song_title, entry?.mode, entry?.level),
      subtitle: [
        targetScore > 0 ? formatScore(targetScore) : '',
        compactText(entry?.new_grade, 20),
        scoreGain > 0 ? formatDelta(scoreGain) : '',
      ].filter(Boolean).join(' • '),
      challengeCard,
    };
  }).filter(Boolean);
}

export function buildClearChallengeOptions({
  clearId,
  username,
  clears,
}) {
  const id = String(clearId || '').trim();
  if (!id) return [];

  const rows = Array.isArray(clears)
    ? clears.filter((entry) => String(entry?.entry_type || '').trim().toLowerCase() !== 'title_unlock')
    : [];

  return rows.map((entry, index) => {
    const challengeCard = buildClearChallengeCard({
      clearId: id,
      username,
      clears: rows,
      selectedEntry: entry,
    });
    if (!challengeCard) return null;

    return {
      id: `clear-${id}-${index}-${String(entry?.song_title || '').trim()}-${String(entry?.mode || '').trim()}-${Number(entry?.level) || 0}`,
      title: formatChartLabel(entry?.song_title, entry?.mode, entry?.level),
      subtitle: [
        compactText(entry?.grade, 20),
        (Number(entry?.score) || 0) > 0 ? formatScore(entry.score) : '',
      ].filter(Boolean).join(' • '),
      challengeCard,
    };
  }).filter(Boolean);
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

export function buildChartChallengeCard({
  chartId,
  chartTitle,
  mode,
  level,
  challengerName,
  best = null,
}) {
  const id = String(chartId || '').trim();
  if (!id) return null;

  const challenger = String(challengerName || 'Player').trim() || 'Player';
  const chartLabel = formatChartLabel(chartTitle, mode, level);
  const score = Number(best?.score) || 0;
  const grade = compactText(best?.grade, 20);
  const isStageBreak = !!best?.is_stage_break;

  if (best && score > 0 && !isStageBreak) {
    return {
      kind: 'beat_score',
      path: `/songs/chart/${id}`,
      title: 'Beat this score',
      subtitle: `${challenger} challenged you on ${chartLabel}`,
      targetLabel: `Target ${formatScore(score)}`,
      detailLabel: [grade, `From current best`].filter(Boolean).join(' • '),
      buttonLabel: 'Open chart',
      songTitle: String(chartTitle || ''),
      mode: String(mode || ''),
      level: Number(level) || 0,
      targetScore: score,
      targetGrade: grade,
      originUsername: challenger,
    };
  }

  return {
    kind: 'clear_chart',
    path: `/songs/chart/${id}`,
    title: 'Clear this chart',
    subtitle: `${challenger} challenged you on ${chartLabel}`,
    targetLabel: chartLabel,
    detailLabel: grade || '',
    buttonLabel: 'Open chart',
    songTitle: String(chartTitle || ''),
    mode: String(mode || ''),
    level: Number(level) || 0,
    targetScore: score,
    targetGrade: grade,
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

// ─── Weekly Challenge Play shares ─────────────────────────

export function buildWcPlayLinkShare({
  playPostId,
  username,
  avatar = '',
  weekKey = '',
  plays,
}) {
  const id = String(playPostId || '').trim();
  if (!id) return null;

  const rows = Array.isArray(plays) ? plays.filter(Boolean) : [];
  const authorName = String(username || 'Player').trim() || 'Player';

  if (rows.length === 0) {
    return {
      kind: 'weekly_challenge',
      path: `/weekly-play/${id}`,
      title: `${authorName}'s weekly challenge`,
      subtitle: weekKey ? `Week ${weekKey}` : 'Open on Shinsa.',
      buttonLabel: 'Open weekly challenge',
      songTitle: '',
      mode: '',
      level: 0,
      targetScore: 0,
    };
  }

  if (rows.length === 1) {
    const [entry] = rows;
    const scoreNum = Number(entry?.score) || 0;
    return {
      kind: 'weekly_challenge',
      path: `/weekly-play/${id}`,
      title: `${authorName}'s weekly challenge`,
      subtitle: [
        formatChartLabel(entry?.song_title, entry?.mode, entry?.level),
        formatScore(scoreNum),
        entry?.weekly_challenge_rank ? `WC #${entry.weekly_challenge_rank}` : '',
      ].filter(Boolean).join(' • '),
      buttonLabel: 'Open weekly challenge',
      songTitle: String(entry?.song_title || ''),
      mode: String(entry?.mode || ''),
      level: Number(entry?.level) || 0,
      targetScore: scoreNum,
      score: scoreNum,
      grade: compactText(entry?.grade, 20),
      jacketUrl: String(entry?.background_url || '').trim(),
      playerName: authorName,
      playerAvatar: String(avatar || '').trim(),
    };
  }

  const bestEntry = rows.reduce((best, entry) => {
    const sc = Number(entry?.score) || 0;
    if (!best) return { entry, score: sc };
    return sc > best.score ? { entry, score: sc } : best;
  }, null);

  return {
    kind: 'weekly_challenge',
    path: `/weekly-play/${id}`,
    title: `${authorName}'s ${rows.length} weekly challenges`,
    subtitle: bestEntry?.entry
      ? `Best: ${formatChartLabel(bestEntry.entry.song_title, bestEntry.entry.mode, bestEntry.entry.level)} ${formatScore(bestEntry.score)}`
      : `${rows.length} charts played`,
    buttonLabel: 'Open weekly challenge',
    songTitle: String(bestEntry?.entry?.song_title || ''),
    mode: String(bestEntry?.entry?.mode || ''),
    level: Number(bestEntry?.entry?.level) || 0,
    targetScore: Number(bestEntry?.score) || 0,
  };
}

export function buildWcPlayChallengeOptions({
  playPostId,
  username,
  plays,
}) {
  const id = String(playPostId || '').trim();
  if (!id) return [];

  const rows = Array.isArray(plays) ? plays.filter(Boolean) : [];
  return rows.map((entry, index) => {
    const targetScore = Number(entry?.score) || 0;
    const chartLabel = formatChartLabel(entry?.song_title, entry?.mode, entry?.level);
    return {
      id: `wc-${id}-${index}-${String(entry?.song_title || '').trim()}-${String(entry?.mode || '').trim()}-${Number(entry?.level) || 0}`,
      title: chartLabel,
      subtitle: [
        targetScore > 0 ? formatScore(targetScore) : '',
        compactText(entry?.grade, 20),
        entry?.weekly_challenge_rank ? `WC #${entry.weekly_challenge_rank}` : '',
      ].filter(Boolean).join(' • '),
      challengeCard: {
        kind: 'challenge',
        path: `/weekly-play/${id}`,
        title: `Beat my weekly challenge score!`,
        subtitle: chartLabel,
        buttonLabel: 'Open challenge',
        songTitle: String(entry?.song_title || ''),
        mode: String(entry?.mode || ''),
        level: Number(entry?.level) || 0,
        targetScore,
        targetGrade: compactText(entry?.grade, 20),
        originUsername: String(username || ''),
      },
    };
  }).filter(Boolean);
}
