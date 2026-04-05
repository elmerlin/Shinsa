export function parseGrade(rawGrade, fallback = '') {
  const source = String(rawGrade || fallback || '').trim();
  if (!source) {
    return {
      raw: '',
      display: '',
      normalized: '',
      isBroken: false,
    };
  }

  const isBroken = /^x(?:[_-]|$)\s*/i.test(source);
  const stripped = isBroken ? source.replace(/^x(?:[_-]|$)\s*/i, '').trim() : source;
  const compact = stripped.replace(/\s+/g, '').replace(/-/g, '_');
  const upperCompact = compact.toUpperCase();
  const aliases = {
    AP: 'A+',
    AAP: 'AA+',
    AAAP: 'AAA+',
    SP: 'S+',
    SSP: 'SS+',
    SSSP: 'SSS+',
    A_P: 'A+',
    AA_P: 'AA+',
    AAA_P: 'AAA+',
    S_P: 'S+',
    SS_P: 'SS+',
    SSS_P: 'SSS+',
    STAGEBREAK: 'F',
    STAGE_BREAK: 'F',
  };

  const canonical = aliases[upperCompact] || upperCompact || stripped || source;
  const display = isBroken
    ? canonical.replace(/\+/g, '').toLowerCase()
    : canonical;

  return {
    raw: source,
    display,
    normalized: display.toUpperCase(),
    isBroken,
  };
}

export function getScoreRankInfo(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

export function getGradeColorClass(rawGrade, score = 0) {
  const fallbackRank = getScoreRankInfo(score);
  const normalized = parseGrade(rawGrade, fallbackRank.label).normalized;

  if (normalized.includes('SSS')) return 'text-sky-300';
  if (normalized.includes('SS')) return 'text-piu-gold';
  if (normalized.includes('S')) return 'text-amber-400';
  if (normalized.includes('AAA')) return 'text-piu-silver';
  if (normalized.includes('AA')) return 'text-piu-bronze';
  if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  return fallbackRank.color;
}

export function getGradeDisplayLabel(rawGrade, score = 0) {
  const fallbackRank = getScoreRankInfo(score);
  return parseGrade(rawGrade, fallbackRank.label).display || fallbackRank.label;
}
