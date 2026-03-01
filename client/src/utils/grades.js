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

  const isBroken = /^x[_-]\s*/i.test(source);
  const stripped = isBroken ? source.replace(/^x[_-]\s*/i, '').trim() : source;
  const display = stripped || source;

  return {
    raw: source,
    display,
    normalized: display.toUpperCase(),
    isBroken,
  };
}

