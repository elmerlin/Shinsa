const PIUGAME_SOURCE_UTC_OFFSET_MINUTES = 9 * 60;

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function formatSqliteUtc(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join('-') + ` ${padDatePart(date.getUTCHours())}:${padDatePart(date.getUTCMinutes())}:${padDatePart(date.getUTCSeconds())}`;
}

function parsePiugamePlayedAtUtc(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const normalized = raw.replace(/[./]/g, '-').replace(/\s+/g, ' ');

  if (/[zZ]$/.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized) || /[+-]\d{4}$/.test(normalized)) {
    const direct = new Date(normalized);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const ymd = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (!ymd) {
    const fallback = new Date(normalized);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const year = parseInt(ymd[1], 10);
  const month = parseInt(ymd[2], 10) - 1;
  const day = parseInt(ymd[3], 10);
  const hour = parseInt(ymd[4] || '0', 10);
  const minute = parseInt(ymd[5] || '0', 10);
  const second = parseInt(ymd[6] || '0', 10);

  const sourceMs = Date.UTC(year, month, day, hour, minute, second);
  return new Date(sourceMs - (PIUGAME_SOURCE_UTC_OFFSET_MINUTES * 60 * 1000));
}

function normalizePiugamePlayedAtUtc(value) {
  const parsed = parsePiugamePlayedAtUtc(value);
  return parsed ? formatSqliteUtc(parsed) : '';
}

module.exports = {
  PIUGAME_SOURCE_UTC_OFFSET_MINUTES,
  formatSqliteUtc,
  normalizePiugamePlayedAtUtc,
  parsePiugamePlayedAtUtc,
};
