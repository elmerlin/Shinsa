const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { extractYoutubeVideoId } = require('./dailyHighlights');
const { normalizeUtcDateKey } = require('./dailyReplaySelection');

const MIX_TAPE_STATUSES = new Set(['pending', 'running', 'completed', 'partial', 'failed']);
const MIX_TAPE_WIDTH = 1080;
const MIX_TAPE_HEIGHT = 1920;
const INTRO_DURATION_SECONDS = 3;
const OUTRO_DURATION_SECONDS = 2;
const DEFAULT_MAX_CLIPS = 5;
const DEFAULT_MAX_CLIP_SECONDS = 30;
const OUTPUT_FRAME_RATE = 30;
let sharpModule = null;

function normalizeStatus(value, fallback = 'pending') {
  const status = String(value || '').trim().toLowerCase();
  return MIX_TAPE_STATUSES.has(status) ? status : fallback;
}

function getYtDlpCommand() {
  return String(process.env.DAILY_MIX_TAPE_YTDLP_BIN || process.env.YTDLP_BIN || 'yt-dlp').trim() || 'yt-dlp';
}

function getSharp() {
  if (sharpModule) return sharpModule;
  // Lazy-load sharp so helper-only code paths and tests can run without the native module present.
  sharpModule = require('sharp');
  return sharpModule;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function quoteForFfmpeg(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
}

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildChartLabel(item) {
  const mode = String(item.mode || '').trim();
  const level = String(item.level || '').trim();
  if (!mode && !level) return '';
  const shortMode = mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : mode.slice(0, 1).toUpperCase();
  return `${shortMode}${level}`;
}

function getYtDlpAuthArgs() {
  const args = [];
  const cookieFile = String(
    process.env.DAILY_MIX_TAPE_YTDLP_COOKIE_FILE
    || process.env.YTDLP_COOKIE_FILE
    || ''
  ).trim();
  const cookiesFromBrowser = String(process.env.DAILY_MIX_TAPE_YTDLP_COOKIES_FROM_BROWSER || '').trim();
  const extractorArgs = String(process.env.DAILY_MIX_TAPE_YTDLP_EXTRACTOR_ARGS || '').trim();

  if (cookieFile) {
    args.push('--cookies', cookieFile);
  }
  if (cookiesFromBrowser) {
    args.push('--cookies-from-browser', cookiesFromBrowser);
  }
  if (extractorArgs) {
    args.push('--extractor-args', extractorArgs);
  }

  return args;
}

function getYtDlpNetworkArgs() {
  const args = [];
  const proxy = String(process.env.DAILY_MIX_TAPE_YTDLP_PROXY || '').trim();
  const impersonate = String(process.env.DAILY_MIX_TAPE_YTDLP_IMPERSONATE || '').trim();
  const sleepRequests = String(process.env.DAILY_MIX_TAPE_YTDLP_SLEEP_REQUESTS || '').trim();
  const sleepInterval = String(process.env.DAILY_MIX_TAPE_YTDLP_SLEEP_INTERVAL || '').trim();
  const maxSleepInterval = String(process.env.DAILY_MIX_TAPE_YTDLP_MAX_SLEEP_INTERVAL || '').trim();
  const retrySleepRaw = String(process.env.DAILY_MIX_TAPE_YTDLP_RETRY_SLEEP || '').trim();

  if (proxy) {
    args.push('--proxy', proxy);
  }
  if (impersonate) {
    args.push('--impersonate', impersonate);
  }
  if (sleepRequests) {
    args.push('--sleep-requests', sleepRequests);
  }
  if (sleepInterval) {
    args.push('--sleep-interval', sleepInterval);
  }
  if (maxSleepInterval) {
    args.push('--max-sleep-interval', maxSleepInterval);
  }
  if (retrySleepRaw) {
    for (const entry of retrySleepRaw.split('|').map((value) => value.trim()).filter(Boolean)) {
      args.push('--retry-sleep', entry);
    }
  }

  return args;
}

function normalizeMixTapeSelection(selection = [], { maxClips = DEFAULT_MAX_CLIPS, maxClipSeconds = DEFAULT_MAX_CLIP_SECONDS } = {}) {
  const list = Array.isArray(selection) ? selection : [];
  return list.slice(0, maxClips).map((item, index) => {
    const replayEmbedUrl = String(item.replay_embed_url || item.replayUrl || '').trim();
    const replayVideoId = String(item.replay_video_id || item.replayVideoId || '').trim() || extractYoutubeVideoId(replayEmbedUrl);
    const rawStart = Number(item.replay_start_seconds ?? item.replayStartSeconds);
    const rawEnd = Number(item.replay_end_seconds ?? item.replayEndSeconds);
    const startSeconds = Number.isFinite(rawStart) ? Math.max(0, Math.floor(rawStart)) : 0;
    const endSeconds = Number.isFinite(rawEnd) ? Math.max(0, Math.floor(rawEnd)) : 0;
    const clipDuration = endSeconds > startSeconds ? Math.min(maxClipSeconds, endSeconds - startSeconds) : 0;

    return {
      rank: index + 1,
      user_id: String(item.user_id || '').trim(),
      username: String(item.username || '').trim(),
      nationality: String(item.nationality || '').trim(),
      song_title: String(item.song_title || '').trim(),
      mode: String(item.mode || '').trim(),
      level: String(item.level || '').trim(),
      score: Number(item.score || 0) || 0,
      grade: String(item.grade || '').trim(),
      plate: String(item.plate || '').trim(),
      replay_embed_url: replayEmbedUrl,
      replay_video_id: replayVideoId,
      replay_start_seconds: startSeconds,
      replay_end_seconds: endSeconds,
      clip_duration_seconds: clipDuration,
      background_url: String(item.background_url || '').trim(),
      play_id: Number(item.play_id || item.id || 0) || 0,
      replay_source_kind: String(item.replay_source_kind || '').trim(),
    };
  });
}

function buildClipManifest(selection = [], options = {}) {
  return normalizeMixTapeSelection(selection, options).filter((item) => (
    item.replay_video_id
    && item.clip_duration_seconds > 0
    && item.replay_end_seconds > item.replay_start_seconds
  ));
}

function determineMixTapeStatus({ totalSelected = 0, successfulCount = 0, failureCount = 0 } = {}) {
  if (totalSelected <= 0 || successfulCount <= 0) return 'failed';
  if (successfulCount >= totalSelected && failureCount <= 0) return 'completed';
  if (successfulCount >= 3) return 'partial';
  return 'failed';
}

function buildMixTapeUrls(dateKey) {
  const safeDateKey = normalizeUtcDateKey(dateKey);
  return {
    videoUrl: `/uploads/mix-tapes/${safeDateKey}.mp4`,
    thumbnailUrl: `/uploads/mix-tapes/${safeDateKey}.jpg`,
  };
}

function normalizeRow(row) {
  if (!row) return null;
  let selection = [];
  try {
    const parsed = JSON.parse(String(row.selection_json || '[]'));
    selection = Array.isArray(parsed) ? parsed : [];
  } catch {
    selection = [];
  }
  return {
    date_key: String(row.date_key || '').trim(),
    status: normalizeStatus(row.status, 'pending'),
    selection,
    selection_json: JSON.stringify(selection),
    success_count: Number(row.success_count || 0) || 0,
    failure_count: Number(row.failure_count || 0) || 0,
    video_url: String(row.video_url || '').trim(),
    thumbnail_url: String(row.thumbnail_url || '').trim(),
    duration_seconds: Number(row.duration_seconds || 0) || 0,
    published_at: String(row.published_at || '').trim(),
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
    error_summary: String(row.error_summary || '').trim(),
  };
}

function getDailyMixTapeByDateKey(db, dateKey) {
  const row = db.prepare(`
    SELECT date_key, status, selection_json, success_count, failure_count, video_url, thumbnail_url,
           duration_seconds, published_at, created_at, updated_at, error_summary
    FROM daily_mix_tapes
    WHERE date_key = ?
    LIMIT 1
  `).get(normalizeUtcDateKey(dateKey));
  return normalizeRow(row);
}

function getLatestPublishedDailyMixTape(db) {
  const row = db.prepare(`
    SELECT date_key, status, selection_json, success_count, failure_count, video_url, thumbnail_url,
           duration_seconds, published_at, created_at, updated_at, error_summary
    FROM daily_mix_tapes
    WHERE status IN ('completed', 'partial')
      AND video_url != ''
    ORDER BY date_key DESC
    LIMIT 1
  `).get();
  return normalizeRow(row);
}

function listDailyMixTapeRuns(db, { limit = 30 } = {}) {
  return db.prepare(`
    SELECT date_key, status, selection_json, success_count, failure_count, video_url, thumbnail_url,
           duration_seconds, published_at, created_at, updated_at, error_summary
    FROM daily_mix_tapes
    ORDER BY date_key DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, Number(limit) || 30))).map(normalizeRow);
}

function upsertDailyMixTape(db, input) {
  const row = {
    date_key: normalizeUtcDateKey(input.date_key),
    status: normalizeStatus(input.status),
    selection_json: JSON.stringify(Array.isArray(input.selection) ? input.selection : []),
    success_count: Number(input.success_count || 0) || 0,
    failure_count: Number(input.failure_count || 0) || 0,
    video_url: String(input.video_url || '').trim(),
    thumbnail_url: String(input.thumbnail_url || '').trim(),
    duration_seconds: Number(input.duration_seconds || 0) || 0,
    published_at: String(input.published_at || '').trim(),
    error_summary: String(input.error_summary || '').trim(),
  };

  db.prepare(`
    INSERT INTO daily_mix_tapes (
      date_key, status, selection_json, success_count, failure_count, video_url, thumbnail_url,
      duration_seconds, published_at, created_at, updated_at, error_summary
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT(date_key) DO UPDATE SET
      status = excluded.status,
      selection_json = excluded.selection_json,
      success_count = excluded.success_count,
      failure_count = excluded.failure_count,
      video_url = excluded.video_url,
      thumbnail_url = excluded.thumbnail_url,
      duration_seconds = excluded.duration_seconds,
      published_at = excluded.published_at,
      updated_at = datetime('now'),
      error_summary = excluded.error_summary
  `).run(
    row.date_key,
    row.status,
    row.selection_json,
    row.success_count,
    row.failure_count,
    row.video_url,
    row.thumbnail_url,
    row.duration_seconds,
    row.published_at,
    row.error_summary,
  );

  return getDailyMixTapeByDateKey(db, row.date_key);
}

function buildMixTapePayload(row) {
  if (!row?.video_url || !row?.thumbnail_url) return null;
  return {
    dateKey: row.date_key,
    title: `Best Plays of ${row.date_key}`,
    status: row.status,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds,
    durationLabel: formatDuration(row.duration_seconds),
    successCount: row.success_count,
    failureCount: row.failure_count,
    clipCount: Array.isArray(row.selection) ? row.selection.length : 0,
    publishedAt: row.published_at,
    items: Array.isArray(row.selection) ? row.selection : [],
  };
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function runCommand(command, args, { cwd, logger = console } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      logger?.warn?.(`[DailyMixTape] Command failed: ${command} ${args.join(' ')}`);
      reject(error);
    });
  });
}

async function commandExists(command) {
  try {
    await runCommand(command, command === 'ffmpeg' ? ['-version'] : ['--version']);
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    return true;
  }
}

async function getDailyMixTapeBinaryAvailability() {
  const ytDlpCommand = getYtDlpCommand();
  const [ffmpegAvailable, ytDlpAvailable] = await Promise.all([
    commandExists('ffmpeg'),
    commandExists(ytDlpCommand),
  ]);
  return {
    ffmpegAvailable,
    ytDlpAvailable,
    ytDlpCommand,
  };
}

function buildBaseSvg({ title, subtitle, footer, accent = '#22d3ee', tags = [] }) {
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  const safeFooter = escapeXml(footer);
  const tagMarkup = tags.map((tag, index) => {
    const x = 80 + (index * 190);
    return `
      <rect x="${x}" y="148" rx="24" ry="24" width="166" height="52" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)" />
      <text x="${x + 83}" y="181" font-size="22" font-weight="700" text-anchor="middle" fill="#d7e8f5">${escapeXml(tag)}</text>
    `;
  }).join('');

  return `
    <svg width="${MIX_TAPE_WIDTH}" height="${MIX_TAPE_HEIGHT}" viewBox="0 0 ${MIX_TAPE_WIDTH} ${MIX_TAPE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#08111f" />
          <stop offset="55%" stop-color="#101b32" />
          <stop offset="100%" stop-color="#050813" />
        </linearGradient>
        <radialGradient id="flare" cx="50%" cy="18%" r="62%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.22" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
      <rect width="100%" height="100%" fill="url(#flare)" />
      <rect x="54" y="54" width="${MIX_TAPE_WIDTH - 108}" height="${MIX_TAPE_HEIGHT - 108}" rx="42" ry="42" fill="rgba(5,10,20,0.42)" stroke="rgba(255,255,255,0.12)" />
      <text x="80" y="120" font-size="34" font-weight="700" letter-spacing="8" fill="#7ed7ff">PUMP SHINSA</text>
      ${tagMarkup}
      <text x="80" y="320" font-size="96" font-weight="900" fill="#ffffff">${safeTitle}</text>
      <text x="80" y="390" font-size="40" font-weight="600" fill="#c8d7e8">${safeSubtitle}</text>
      <text x="80" y="${MIX_TAPE_HEIGHT - 110}" font-size="30" font-weight="600" fill="#8ba0b8">${safeFooter}</text>
    </svg>
  `;
}

async function renderSvgToFile(svg, outputPath, format = 'png') {
  const image = getSharp()(Buffer.from(svg));
  if (format === 'jpg' || format === 'jpeg') {
    await image.jpeg({ quality: 86 }).toFile(outputPath);
    return;
  }
  await image.png().toFile(outputPath);
}

async function createPosterImage(outputPath, dateKey, selection = []) {
  const topItems = selection.slice(0, 3);
  const rowsMarkup = topItems.map((item, index) => `
    <g transform="translate(80 ${540 + (index * 198)})">
      <rect x="0" y="0" rx="34" ry="34" width="920" height="146" fill="rgba(255,255,255,0.055)" stroke="rgba(255,255,255,0.10)" />
      <circle cx="74" cy="73" r="42" fill="rgba(34,211,238,0.20)" stroke="rgba(34,211,238,0.45)" stroke-width="3" />
      <text x="74" y="88" text-anchor="middle" font-size="38" font-weight="900" fill="#ffffff">${index + 1}</text>
      <text x="148" y="60" font-size="34" font-weight="800" fill="#ffffff">${escapeXml(truncate(item.song_title || 'Untitled chart', 34))}</text>
      <text x="148" y="104" font-size="24" font-weight="700" fill="#8fd9ff">${escapeXml(`${item.username || 'Unknown'} • ${buildChartLabel(item)} • ${item.grade || 'Replay'}`)}</text>
    </g>
  `).join('');

  const svg = `
    ${buildBaseSvg({
      title: 'Daily Mix Tape',
      subtitle: `Best plays of ${dateKey}`,
      footer: `${selection.length} replay${selection.length === 1 ? '' : 's'} stitched into one reel`,
      accent: '#22d3ee',
      tags: ['AUTO', 'REPLAYS'],
    }).replace('</svg>', '')}
      ${rowsMarkup}
    </svg>
  `;
  await renderSvgToFile(svg, outputPath, 'jpg');
}

async function createStillImage(outputPath, { title, subtitle, footer, accent, tags }) {
  const svg = buildBaseSvg({ title, subtitle, footer, accent, tags });
  await renderSvgToFile(svg, outputPath, 'png');
}

async function createClipOverlay(outputPath, clip) {
  const title = truncate(clip.song_title || 'Untitled chart', 30);
  const subtitle = truncate(`${clip.username || 'Unknown'} • ${buildChartLabel(clip)} • ${clip.grade || 'Replay'}`, 42);
  const scoreText = Number(clip.score || 0).toLocaleString();
  const plateText = clip.plate ? truncate(clip.plate, 12) : '';

  const svg = `
    <svg width="${MIX_TAPE_WIDTH}" height="${MIX_TAPE_HEIGHT}" viewBox="0 0 ${MIX_TAPE_WIDTH} ${MIX_TAPE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="rgba(3,7,18,0.90)" />
          <stop offset="100%" stop-color="rgba(3,7,18,0)" />
        </linearGradient>
      </defs>
      <rect x="0" y="${MIX_TAPE_HEIGHT - 470}" width="${MIX_TAPE_WIDTH}" height="470" fill="url(#fade)" />
      <rect x="56" y="56" width="112" height="112" rx="32" ry="32" fill="rgba(34,211,238,0.18)" stroke="rgba(34,211,238,0.45)" stroke-width="3" />
      <text x="112" y="128" text-anchor="middle" font-size="58" font-weight="900" fill="#ffffff">#${clip.rank}</text>
      <rect x="56" y="${MIX_TAPE_HEIGHT - 340}" width="968" height="228" rx="36" ry="36" fill="rgba(5,10,20,0.70)" stroke="rgba(255,255,255,0.14)" />
      <text x="88" y="${MIX_TAPE_HEIGHT - 258}" font-size="56" font-weight="900" fill="#ffffff">${escapeXml(title)}</text>
      <text x="88" y="${MIX_TAPE_HEIGHT - 196}" font-size="30" font-weight="700" fill="#8fd9ff">${escapeXml(subtitle)}</text>
      <text x="88" y="${MIX_TAPE_HEIGHT - 116}" font-size="64" font-weight="900" fill="#ffffff">${escapeXml(scoreText)}</text>
      <text x="${MIX_TAPE_WIDTH - 88}" y="${MIX_TAPE_HEIGHT - 116}" text-anchor="end" font-size="64" font-weight="900" fill="#ffd76c">${escapeXml(clip.grade || 'Replay')}</text>
      ${plateText ? `<text x="${MIX_TAPE_WIDTH - 88}" y="${MIX_TAPE_HEIGHT - 66}" text-anchor="end" font-size="28" font-weight="700" fill="#cdd9e7">${escapeXml(plateText)}</text>` : ''}
    </svg>
  `;

  await renderSvgToFile(svg, outputPath, 'png');
}

async function createStillVideo(inputImagePath, outputVideoPath, durationSeconds) {
  await runCommand('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', inputImagePath,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', String(durationSeconds),
    '-shortest',
    '-r', String(OUTPUT_FRAME_RATE),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputVideoPath,
  ]);
}

async function downloadClipWindow(clip, outputPath) {
  const watchUrl = `https://www.youtube.com/watch?v=${clip.replay_video_id}`;
  await runCommand(getYtDlpCommand(), [
    ...getYtDlpAuthArgs(),
    ...getYtDlpNetworkArgs(),
    '--force-overwrites',
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '--force-keyframes-at-cuts',
    '--download-sections', `*${formatTimestamp(clip.replay_start_seconds)}-${formatTimestamp(clip.replay_start_seconds + clip.clip_duration_seconds)}`,
    '-o', outputPath,
    watchUrl,
  ]);
}

async function renderPortraitClip(inputPath, overlayPath, outputPath) {
  await runCommand('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-i', overlayPath,
    '-filter_complex',
    '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,boxblur=32:10,crop=1080:1920[bg];'
      + '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];'
      + '[bg][fg]overlay=(W-w)/2:(H-h)/2[base];'
      + '[base][1:v]overlay=0:0,format=yuv420p[v]',
    '-map', '[v]',
    '-map', '0:a?',
    '-r', String(OUTPUT_FRAME_RATE),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

async function concatSegments(segmentPaths, outputPath, workDir) {
  const listFile = path.join(workDir, 'segments.txt');
  const contents = segmentPaths.map((segmentPath) => `file '${quoteForFfmpeg(segmentPath)}'`).join('\n');
  await fsp.writeFile(listFile, contents, 'utf8');
  await runCommand('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ], { cwd: workDir });
}

async function safeRemoveDir(dirPath) {
  if (!dirPath) return;
  await fsp.rm(dirPath, { recursive: true, force: true });
}

async function generateMixTapeAssets(selection, { dateKey, outputDir, logger = console } = {}) {
  const manifest = buildClipManifest(selection);
  const binaryAvailability = await getDailyMixTapeBinaryAvailability();
  if (!binaryAvailability.ffmpegAvailable || !binaryAvailability.ytDlpAvailable) {
    throw new Error('Daily mix tape tooling unavailable. ffmpeg and yt-dlp are required on the server.');
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'shinsa-mix-tape-'));
  try {
    await ensureDir(outputDir);

    const introImagePath = path.join(workDir, 'intro.png');
    const outroImagePath = path.join(workDir, 'outro.png');
    const introVideoPath = path.join(workDir, 'intro.mp4');
    const outroVideoPath = path.join(workDir, 'outro.mp4');
    const posterPath = path.join(workDir, 'poster.jpg');

    await createPosterImage(posterPath, dateKey, manifest);
    await createStillImage(introImagePath, {
      title: 'Daily Mix Tape',
      subtitle: `Best replay clips from ${dateKey}`,
      footer: 'Powered by Pump Shinsa',
      accent: '#22d3ee',
      tags: ['AUTO', 'REPLAYS'],
    });
    await createStillImage(outroImagePath, {
      title: 'Run It Back',
      subtitle: 'Watch the full boards and replay pages on Pump Shinsa',
      footer: 'pumpshinsa.com',
      accent: '#f59e0b',
      tags: ['SEE MORE'],
    });
    await createStillVideo(introImagePath, introVideoPath, INTRO_DURATION_SECONDS);
    await createStillVideo(outroImagePath, outroVideoPath, OUTRO_DURATION_SECONDS);

    const successful = [];
    const failures = [];

    for (let index = 0; index < manifest.length; index += 1) {
      const clip = manifest[index];
      const rawClipPath = path.join(workDir, `raw-${index}.mp4`);
      const overlayPath = path.join(workDir, `overlay-${index}.png`);
      const renderedClipPath = path.join(workDir, `segment-${index}.mp4`);
      try {
        await downloadClipWindow(clip, rawClipPath);
        await createClipOverlay(overlayPath, clip);
        await renderPortraitClip(rawClipPath, overlayPath, renderedClipPath);
        successful.push({ ...clip, renderedClipPath });
      } catch (error) {
        logger?.warn?.(`[DailyMixTape] Failed clip ${clip.rank} (${clip.song_title || clip.replay_video_id}): ${error.message}`);
        failures.push({
          rank: clip.rank,
          song_title: clip.song_title,
          replay_video_id: clip.replay_video_id,
          error: error.message,
        });
      }
    }

    const status = determineMixTapeStatus({
      totalSelected: manifest.length,
      successfulCount: successful.length,
      failureCount: failures.length,
    });

    if (status === 'failed') {
      return {
        status,
        successful,
        failures,
        durationSeconds: 0,
        videoUrl: '',
        thumbnailUrl: '',
      };
    }

    const finalVideoPath = path.join(outputDir, `${dateKey}.mp4`);
    const finalThumbnailPath = path.join(outputDir, `${dateKey}.jpg`);
    const stitchedPath = path.join(workDir, 'final.mp4');
    await concatSegments(
      [introVideoPath, ...successful.map((clip) => clip.renderedClipPath), outroVideoPath],
      stitchedPath,
      workDir,
    );
    await fsp.copyFile(stitchedPath, finalVideoPath);
    await fsp.copyFile(posterPath, finalThumbnailPath);

    return {
      status,
      successful,
      failures,
      durationSeconds: (successful.reduce((sum, clip) => sum + clip.clip_duration_seconds, 0) + INTRO_DURATION_SECONDS + OUTRO_DURATION_SECONDS),
      ...buildMixTapeUrls(dateKey),
    };
  } finally {
    await safeRemoveDir(workDir);
  }
}

async function runDailyMixTapeJob(db, {
  dateKey,
  selection = [],
  logger = console,
  outputDir = path.join(__dirname, '..', 'uploads', 'mix-tapes'),
} = {}) {
  const normalizedDateKey = normalizeUtcDateKey(dateKey);
  const normalizedSelection = normalizeMixTapeSelection(selection);
  const previous = getDailyMixTapeByDateKey(db, normalizedDateKey);

  upsertDailyMixTape(db, {
    date_key: normalizedDateKey,
    status: 'running',
    selection: normalizedSelection,
    success_count: 0,
    failure_count: 0,
    video_url: previous?.video_url || '',
    thumbnail_url: previous?.thumbnail_url || '',
    duration_seconds: previous?.duration_seconds || 0,
    published_at: previous?.published_at || '',
    error_summary: '',
  });

  try {
    if (normalizedSelection.length === 0) {
      const preservedStatus = previous?.video_url && previous?.thumbnail_url && ['completed', 'partial'].includes(previous.status)
        ? previous.status
        : 'failed';
      return upsertDailyMixTape(db, {
        date_key: normalizedDateKey,
        status: preservedStatus,
        selection: [],
        success_count: 0,
        failure_count: 0,
        video_url: preservedStatus === 'failed' ? '' : previous.video_url,
        thumbnail_url: preservedStatus === 'failed' ? '' : previous.thumbnail_url,
        duration_seconds: preservedStatus === 'failed' ? 0 : previous.duration_seconds,
        published_at: preservedStatus === 'failed' ? '' : previous.published_at,
        error_summary: 'No valid replay clips were available for this day.',
      });
    }

    const result = await generateMixTapeAssets(normalizedSelection, {
      dateKey: normalizedDateKey,
      outputDir,
      logger,
    });

    return upsertDailyMixTape(db, {
      date_key: normalizedDateKey,
      status: result.status,
      selection: normalizedSelection,
      success_count: result.successful.length,
      failure_count: result.failures.length,
      video_url: result.videoUrl,
      thumbnail_url: result.thumbnailUrl,
      duration_seconds: result.durationSeconds,
      published_at: ['completed', 'partial'].includes(result.status) ? new Date().toISOString() : '',
      error_summary: result.failures.map((entry) => `${entry.song_title || entry.replay_video_id}: ${entry.error}`).slice(0, 4).join(' | '),
    });
  } catch (error) {
    logger?.error?.(`[DailyMixTape] Mix tape generation failed for ${normalizedDateKey}: ${error.message}`);
    const preservedStatus = previous?.video_url && previous?.thumbnail_url && ['completed', 'partial'].includes(previous.status)
      ? previous.status
      : 'failed';
    return upsertDailyMixTape(db, {
      date_key: normalizedDateKey,
      status: preservedStatus,
      selection: normalizedSelection,
      success_count: preservedStatus === 'failed' ? 0 : previous.success_count,
      failure_count: Math.max(1, normalizedSelection.length),
      video_url: preservedStatus === 'failed' ? '' : previous.video_url,
      thumbnail_url: preservedStatus === 'failed' ? '' : previous.thumbnail_url,
      duration_seconds: preservedStatus === 'failed' ? 0 : previous.duration_seconds,
      published_at: preservedStatus === 'failed' ? '' : previous.published_at,
      error_summary: error.message,
    });
  }
}

module.exports = {
  MIX_TAPE_HEIGHT,
  MIX_TAPE_WIDTH,
  buildClipManifest,
  buildMixTapePayload,
  buildMixTapeUrls,
  determineMixTapeStatus,
  getDailyMixTapeBinaryAvailability,
  getDailyMixTapeByDateKey,
  getLatestPublishedDailyMixTape,
  listDailyMixTapeRuns,
  normalizeMixTapeSelection,
  runDailyMixTapeJob,
  upsertDailyMixTape,
};
