const FORMAT_LABELS = {
  round_robin: 'Round Robin',
  pools: 'Pools',
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  gauntlet: 'Gauntlet',
  hour_of_power: 'Hour of Power',
  b15: 'Best 15',
};

function parseTournamentConfig(rawConfig) {
  if (rawConfig && typeof rawConfig === 'object') return rawConfig;
  try {
    return JSON.parse(rawConfig || '{}');
  } catch {
    return {};
  }
}

function formatLabel(format) {
  const key = String(format || '').trim();
  if (!key) return '';
  return FORMAT_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getLegacyPrimaryFormat(config) {
  if (config?.gauntlet_enabled) return 'gauntlet';
  return 'round_robin';
}

function buildFormatSummary(phases, fallbackFormat) {
  const labels = [];
  for (const phase of phases) {
    const label = formatLabel(phase.format);
    if (!label || labels[labels.length - 1] === label) continue;
    labels.push(label);
  }
  if (labels.length === 0 && fallbackFormat) {
    labels.push(formatLabel(fallbackFormat));
  }
  if (labels.length <= 2) return labels.join(' -> ');
  return `${labels[0]} -> ${labels[1]} -> ${labels.length - 2} more`;
}

function groupRows(rows, keyField) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row?.[keyField];
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function enrichTournamentSummaries(db, tournaments = []) {
  if (!db || !Array.isArray(tournaments) || tournaments.length === 0) return [];

  const ids = tournaments.map((tournament) => tournament?.id).filter(Boolean);
  if (ids.length === 0) {
    return tournaments.map((tournament) => ({
      ...tournament,
      config: parseTournamentConfig(tournament?.config),
      participant_count: 0,
      participant_preview: [],
      primary_format: 'round_robin',
      format_summary: 'Round Robin',
      phase_count: 0,
    }));
  }

  const placeholders = ids.map(() => '?').join(',');
  const phaseRows = db.prepare(`
    SELECT tournament_id, format, status, phase_order
    FROM tournament_phases
    WHERE tournament_id IN (${placeholders})
    ORDER BY tournament_id ASC, phase_order ASC
  `).all(...ids);
  // Include all players (active or not) so completed tournaments still
  // surface their participant count + preview avatars on list cards.
  // The detail endpoint (`/api/players/tournament/:id`) doesn't filter
  // by is_active either, so consistency was off.
  const playerRows = db.prepare(`
    SELECT tournament_id, id, name, avatar, nationality, pumbility, seed_rank, created_at
    FROM players
    WHERE tournament_id IN (${placeholders})
    ORDER BY tournament_id ASC,
             pumbility DESC,
             CASE WHEN seed_rank > 0 THEN seed_rank ELSE 2147483647 END ASC,
             datetime(created_at) ASC
  `).all(...ids);

  const phasesByTournament = groupRows(phaseRows, 'tournament_id');
  const playersByTournament = groupRows(playerRows, 'tournament_id');

  return tournaments.map((tournament) => {
    const config = parseTournamentConfig(tournament?.config);
    const phases = phasesByTournament.get(tournament.id) || [];
    const players = playersByTournament.get(tournament.id) || [];
    const activePhase = phases.find((phase) => phase.status === 'ACTIVE');
    const pendingPhase = phases.find((phase) => phase.status === 'PENDING');
    const primaryFormat = activePhase?.format || pendingPhase?.format || phases[0]?.format || getLegacyPrimaryFormat(config);

    return {
      ...tournament,
      config,
      participant_count: players.length,
      participant_preview: players.slice(0, 4).map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar || '',
        nationality: player.nationality || '',
      })),
      primary_format: primaryFormat,
      format_summary: buildFormatSummary(phases, primaryFormat),
      phase_count: phases.length,
    };
  });
}

module.exports = {
  enrichTournamentSummaries,
  parseTournamentConfig,
};
