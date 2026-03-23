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
