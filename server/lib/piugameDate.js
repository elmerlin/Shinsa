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
  const timezoneMatch = normalized.match(/\((?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\)$/i);
  const normalizedWithoutTimezone = timezoneMatch
    ? normalized.slice(0, timezoneMatch.index).trim()
    : normalized;
  const explicitOffsetMinutes = timezoneMatch
    ? ((timezoneMatch[1] === '-' ? -1 : 1)
      * (((parseInt(timezoneMatch[2], 10) || 0) * 60) + (parseInt(timezoneMatch[3] || '0', 10) || 0)))
    : null;

  if (/[zZ]$/.test(normalizedWithoutTimezone) || /[+-]\d{2}:\d{2}$/.test(normalizedWithoutTimezone) || /[+-]\d{4}$/.test(normalizedWithoutTimezone)) {
    const direct = new Date(normalizedWithoutTimezone);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const ymd = normalizedWithoutTimezone.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (!ymd) {
    const fallback = new Date(normalizedWithoutTimezone);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const year = parseInt(ymd[1], 10);
  const month = parseInt(ymd[2], 10) - 1;
  const day = parseInt(ymd[3], 10);
  const hour = parseInt(ymd[4] || '0', 10);
  const minute = parseInt(ymd[5] || '0', 10);
  const second = parseInt(ymd[6] || '0', 10);

  const sourceMs = Date.UTC(year, month, day, hour, minute, second);
  const offsetMinutes = explicitOffsetMinutes == null ? PIUGAME_SOURCE_UTC_OFFSET_MINUTES : explicitOffsetMinutes;
  return new Date(sourceMs - (offsetMinutes * 60 * 1000));
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
