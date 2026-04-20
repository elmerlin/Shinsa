const fs = require('fs');
const path = require('path');

function stripWrappingQuotes(value) {
  if (!value) return '';
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const parsed = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const exportPrefix = line.startsWith('export ') ? 'export ' : '';
    const assignment = exportPrefix ? line.slice(exportPrefix.length) : line;
    const equalsIndex = assignment.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = assignment.slice(0, equalsIndex).trim();
    if (!key) continue;

    const value = stripWrappingQuotes(assignment.slice(equalsIndex + 1).trim());
    parsed[key] = value;
  }

  return parsed;
}

function resolveEnvValue(key, fileEnv, fallback = '') {
  if (typeof process.env[key] === 'string' && process.env[key] !== '') {
    return process.env[key];
  }
  if (typeof fileEnv[key] === 'string' && fileEnv[key] !== '') {
    return fileEnv[key];
  }
  return fallback;
}

const envFileCandidates = [
  process.env.SHINSA_ENV_FILE,
  '/etc/shinsa/shinsa.env',
  path.join(__dirname, '.env.production.local'),
  path.join(__dirname, '.env.local'),
].filter(Boolean);

const fileEnv = envFileCandidates.reduce((acc, filePath) => (
  Object.assign(acc, parseEnvFile(filePath))
), {});

const passthroughKeys = [
  'PORT',
  'DB_PATH',
  'NODE_ENV',
  'NODE_OPTIONS',
  'APP_URL',
  'JWT_SECRET',
  'PIU_ENCRYPT_KEY',
  'PIXELLAB_API_KEY',
  'OPENAI_API_KEY',
  'VAPID_SUBJECT',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REDIRECT_URI',
  'YOUTUBE_OAUTH_SCOPES',
  'YOUTUBE_OAUTH_STATE_SECRET',
  'YOUTUBE_ENCRYPT_KEY',
  'SQUARE_ACCESS_TOKEN',
  'SQUARE_LOCATION_ID',
  'SQUARE_WEBHOOK_SIGNATURE_KEY',
  'SQUARE_ENVIRONMENT',
  'SQUARE_WEBHOOK_URL',
  'ADMIN_USERNAMES',
  'ADMIN_USER_IDS',
  'ENABLE_KR_LOCALE',
  'OVER_RANKING_SCRAPE_LANG',
  'OVER_RANKING_SCRAPE_LIST_DELAY_MS',
  'OVER_RANKING_SCRAPE_CHART_DELAY_MS',
  'OVER_RANKING_SCRAPE_CONCURRENCY',
  'OVER_RANKING_SCRAPE_MAX_PAGES',
  'OVER_RANKING_SCRAPE_MAX_CHARTS',
  'OVER_RANKING_NIGHTLY_ENABLED',
  'OVER_RANKING_NIGHTLY_HOUR',
  'OVER_RANKING_NIGHTLY_MINUTE',
  'PUMBILITY_RANKING_NIGHTLY_ENABLED',
  'PUMBILITY_RANKING_NIGHTLY_HOUR',
  'PUMBILITY_RANKING_NIGHTLY_MINUTE',
  'DAILY_MIX_TAPE_NIGHTLY_ENABLED',
  'DAILY_MIX_TAPE_NIGHTLY_HOUR_UTC',
  'DAILY_MIX_TAPE_NIGHTLY_MINUTE_UTC',
  'DAILY_MIX_TAPE_YTDLP_BIN',
  'DAILY_MIX_TAPE_YTDLP_COOKIE_FILE',
  'DAILY_MIX_TAPE_YTDLP_COOKIES_FROM_BROWSER',
  'DAILY_MIX_TAPE_YTDLP_EXTRACTOR_ARGS',
  'DAILY_MIX_TAPE_YTDLP_PROXY',
  'DAILY_MIX_TAPE_YTDLP_IMPERSONATE',
  'DAILY_MIX_TAPE_YTDLP_JS_RUNTIMES',
  'DAILY_MIX_TAPE_YTDLP_REMOTE_COMPONENTS',
  'DAILY_MIX_TAPE_YTDLP_SLEEP_REQUESTS',
  'DAILY_MIX_TAPE_YTDLP_SLEEP_INTERVAL',
  'DAILY_MIX_TAPE_YTDLP_MAX_SLEEP_INTERVAL',
  'DAILY_MIX_TAPE_YTDLP_RETRY_SLEEP',
  'DAILY_MIX_TAPE_YTDLP_FORMAT',
  'YTDLP_BIN',
  'YTDLP_COOKIE_FILE',
  'LOGIN_RATE_LIMIT_WINDOW_MS',
  'LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
  'LOGIN_LOCKOUT_THRESHOLD',
  'LOGIN_LOCKOUT_MS',
  'STALE_DAY_PASS_PENDING_MINUTES',
];

const env = {
  DB_PATH: resolveEnvValue('DB_PATH', fileEnv, '/var/data/shinsa/shinsa.db'),
  NODE_ENV: resolveEnvValue('NODE_ENV', fileEnv, 'production'),
};

for (const key of passthroughKeys) {
  const value = resolveEnvValue(key, fileEnv);
  if (value !== '') {
    env[key] = value;
  }
}

module.exports = {
  apps: [{
    name: 'shinsa',
    script: 'server/index.js',
    env,
  }],
};
