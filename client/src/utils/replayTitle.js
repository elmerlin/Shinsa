function formatNumber(value) {
  const numeric = parseInt(value, 10) || 0;
  return numeric > 0 ? numeric.toLocaleString('en-GB') : '';
}

function modeLabel(mode, level) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  const numericLevel = parseInt(level, 10) || 0;
  if (!numericLevel) return '';
  if (normalizedMode === 'single') return `S${numericLevel}`;
  if (normalizedMode === 'double') return `D${numericLevel}`;
  if (normalizedMode === 'coop') return `C${numericLevel}`;
  return `${String(mode || '').slice(0, 1).toUpperCase()}${numericLevel}`;
}

export function buildReplayModalTitle(entry = {}) {
  const songTitle = String(entry.song_title || entry.title || '').trim();
  const chart = modeLabel(entry.mode, entry.level);
  const grade = String(entry.new_grade || entry.grade || '').trim();
  const score = formatNumber(entry.new_score || entry.score);

  return [songTitle, chart, grade, score].filter(Boolean).join(' • ') || 'Replay';
}
