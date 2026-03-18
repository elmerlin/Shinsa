const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_SERIES_ID = 'builtin-achievement-series-streak';
const STREAK_SERIES_KEY = 'streak';

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeStarPoints(cx, cy, outerRadius, innerRadius, spikes = 5) {
  const points = [];
  let rotation = -Math.PI / 2;
  const step = Math.PI / spikes;
  for (let index = 0; index < spikes * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(rotation) * radius;
    const y = cy + Math.sin(rotation) * radius;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    rotation += step;
  }
  return points.join(' ');
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function buildStreakBadgeSvg({ days, title, palette, stars }) {
  const starCount = Math.max(1, Math.min(7, parseInt(stars, 10) || 1));
  const starGap = starCount === 1 ? 0 : 24;
  const starStart = 150 - ((starCount - 1) * starGap) / 2;
  const starMarkup = Array.from({ length: starCount }, (_, index) => {
    const cx = starStart + index * starGap;
    const cy = 48;
    return `
      <polygon
        points="${makeStarPoints(cx, cy, 8, 3.8, 5)}"
        fill="${palette.star}"
        opacity="${0.78 + index * 0.03}"
      />
    `;
  }).join('');

  const orbitMarkup = Array.from({ length: Math.max(4, starCount + 2) }, (_, index) => {
    const angle = (-70 + (index * 140) / Math.max(1, starCount + 1)) * (Math.PI / 180);
    const x = 150 + Math.cos(angle) * 108;
    const y = 150 + Math.sin(angle) * 108;
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.2" fill="${palette.orbit}" opacity="0.85" />`;
  }).join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" role="img" aria-label="${escapeXml(days)} day streak badge">
      <defs>
        <radialGradient id="bg-${days}" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stop-color="${palette.innerGlow}" />
          <stop offset="58%" stop-color="${palette.core}" />
          <stop offset="100%" stop-color="${palette.outer}" />
        </radialGradient>
        <linearGradient id="ring-${days}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.ringStart}" />
          <stop offset="50%" stop-color="${palette.ringMid}" />
          <stop offset="100%" stop-color="${palette.ringEnd}" />
        </linearGradient>
        <linearGradient id="plate-${days}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${palette.plateTop}" />
          <stop offset="100%" stop-color="${palette.plateBottom}" />
        </linearGradient>
        <filter id="shadow-${days}" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="${palette.shadow}" flood-opacity="0.55" />
        </filter>
      </defs>

      <rect width="300" height="300" rx="54" fill="#030712" />
      <circle
        cx="150"
        cy="150"
        r="120"
        fill="url(#bg-${days})"
        stroke="url(#ring-${days})"
        stroke-width="18"
        filter="url(#shadow-${days})"
      />
      <circle cx="150" cy="150" r="98" fill="#091224" stroke="${palette.innerStroke}" stroke-width="2.5" />
      <path
        d="M150 84 L184 136 H161 L186 212 L117 143 H140 Z"
        fill="${palette.bolt}"
        opacity="0.22"
      />
      <path
        d="M104 229 H196"
        stroke="${palette.rule}"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.85"
      />
      <g>${orbitMarkup}</g>
      <g>${starMarkup}</g>
      <g text-anchor="middle">
        <text
          x="150"
          y="80"
          fill="${palette.label}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="24"
          font-weight="700"
          letter-spacing="6"
        >STREAK</text>
        <rect x="78" y="224" width="144" height="24" rx="12" fill="url(#plate-${days})" opacity="0.94" />
        <text
          x="150"
          y="174"
          fill="${palette.number}"
          font-family="Arial Black, Arial, Helvetica, sans-serif"
          font-size="${days >= 100 ? 82 : 96}"
          font-weight="900"
          letter-spacing="2"
        >${escapeXml(days)}</text>
        <text
          x="150"
          y="208"
          fill="${palette.label}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="24"
          font-weight="700"
          letter-spacing="4"
        >DAYS</text>
        <text
          x="150"
          y="241"
          fill="${palette.plateText}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="16"
          font-weight="700"
          letter-spacing="2"
        >${escapeXml(title.toUpperCase())}</text>
      </g>
    </svg>
  `;

  return svgDataUrl(svg);
}

function createStreakTierDefinition(days, title, palette, stars, sortOrder) {
  return {
    id: `builtin-achievement-tier-streak-${days}`,
    threshold: days,
    sort_order: sortOrder,
    name: `${days}-Day Streak`,
    description: `Reach a longest recorded streak of ${days} consecutive play days.`,
    image_data: buildStreakBadgeSvg({ days, title, palette, stars }),
  };
}

const BUILT_IN_ACHIEVEMENT_SERIES = [
  {
    id: STREAK_SERIES_ID,
    key: STREAK_SERIES_KEY,
    name: 'Streak',
    description: 'Awarded for your best consecutive play-day streak based on synced Recently Played history. Your longest recorded streak counts even if your current streak is lower.',
    tiers: [
      createStreakTierDefinition(3, 'Ember', {
        outer: '#261307',
        core: '#5b2a0a',
        innerGlow: '#f7a34b',
        ringStart: '#7c2d12',
        ringMid: '#f59e0b',
        ringEnd: '#fde68a',
        innerStroke: '#fdba74',
        bolt: '#fef3c7',
        label: '#fcd34d',
        number: '#fff7ed',
        plateTop: '#6b3413',
        plateBottom: '#3f1b06',
        plateText: '#fef3c7',
        orbit: '#fdba74',
        rule: '#fdba74',
        star: '#fde68a',
        shadow: '#7c2d12',
      }, 1, 0),
      createStreakTierDefinition(5, 'Flare', {
        outer: '#2b1404',
        core: '#6f2e08',
        innerGlow: '#fb923c',
        ringStart: '#9a3412',
        ringMid: '#f97316',
        ringEnd: '#fed7aa',
        innerStroke: '#fdba74',
        bolt: '#ffedd5',
        label: '#fdba74',
        number: '#fff7ed',
        plateTop: '#7c2d12',
        plateBottom: '#4a1d08',
        plateText: '#ffedd5',
        orbit: '#fdba74',
        rule: '#fdba74',
        star: '#fef3c7',
        shadow: '#9a3412',
      }, 2, 1),
      createStreakTierDefinition(10, 'Blaze', {
        outer: '#1f1a06',
        core: '#574009',
        innerGlow: '#facc15',
        ringStart: '#854d0e',
        ringMid: '#facc15',
        ringEnd: '#fef08a',
        innerStroke: '#fde047',
        bolt: '#fef9c3',
        label: '#fde047',
        number: '#fffef0',
        plateTop: '#6b4f08',
        plateBottom: '#3d2d04',
        plateText: '#fff7c2',
        orbit: '#fde047',
        rule: '#fde047',
        star: '#fff7c2',
        shadow: '#854d0e',
      }, 3, 2),
      createStreakTierDefinition(15, 'Inferno', {
        outer: '#2a0909',
        core: '#6e1015',
        innerGlow: '#fb7185',
        ringStart: '#991b1b',
        ringMid: '#ef4444',
        ringEnd: '#fdba74',
        innerStroke: '#fca5a5',
        bolt: '#ffe4e6',
        label: '#fda4af',
        number: '#fff1f2',
        plateTop: '#7f1d1d',
        plateBottom: '#450a0a',
        plateText: '#ffe4e6',
        orbit: '#fb7185',
        rule: '#fb7185',
        star: '#fecdd3',
        shadow: '#7f1d1d',
      }, 4, 3),
      createStreakTierDefinition(30, 'Nova', {
        outer: '#071b24',
        core: '#0c425a',
        innerGlow: '#67e8f9',
        ringStart: '#0f766e',
        ringMid: '#22d3ee',
        ringEnd: '#cffafe',
        innerStroke: '#a5f3fc',
        bolt: '#ecfeff',
        label: '#a5f3fc',
        number: '#f0fdff',
        plateTop: '#155e75',
        plateBottom: '#0c3545',
        plateText: '#ecfeff',
        orbit: '#67e8f9',
        rule: '#67e8f9',
        star: '#cffafe',
        shadow: '#155e75',
      }, 5, 4),
      createStreakTierDefinition(50, 'Apex', {
        outer: '#260f24',
        core: '#6b1d58',
        innerGlow: '#f9a8d4',
        ringStart: '#831843',
        ringMid: '#ec4899',
        ringEnd: '#fbcfe8',
        innerStroke: '#f9a8d4',
        bolt: '#fdf2f8',
        label: '#f9a8d4',
        number: '#fff7fb',
        plateTop: '#9d174d',
        plateBottom: '#4a0d2a',
        plateText: '#fdf2f8',
        orbit: '#f472b6',
        rule: '#f472b6',
        star: '#fce7f3',
        shadow: '#831843',
      }, 6, 5),
      createStreakTierDefinition(100, 'Legend', {
        outer: '#101528',
        core: '#1d2a57',
        innerGlow: '#c4b5fd',
        ringStart: '#4338ca',
        ringMid: '#8b5cf6',
        ringEnd: '#f5d0fe',
        innerStroke: '#ddd6fe',
        bolt: '#f5f3ff',
        label: '#ddd6fe',
        number: '#f8f7ff',
        plateTop: '#4c1d95',
        plateBottom: '#2e1065',
        plateText: '#f5f3ff',
        orbit: '#c4b5fd',
        rule: '#c4b5fd',
        star: '#ede9fe',
        shadow: '#4c1d95',
      }, 7, 6),
    ],
  },
];

function parseDateMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const normalized = raw.replace(/\//g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const ms = Date.parse(`${normalized}T00:00:00Z`);
    return Number.isNaN(ms) ? 0 : ms;
  }

  const direct = Date.parse(normalized.includes('T') ? normalized : `${normalized.replace(' ', 'T')}Z`);
  if (!Number.isNaN(direct)) return direct;

  const ymd = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const yyyy = ymd[1];
    const mm = String(ymd[2]).padStart(2, '0');
    const dd = String(ymd[3]).padStart(2, '0');
    const ms = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    return Number.isNaN(ms) ? 0 : ms;
  }

  return 0;
}

function getDayOrdinal(value) {
  const ms = parseDateMs(value);
  if (ms <= 0) return null;
  return Math.floor(ms / DAY_MS);
}

function computeLongestStreakFromOrdinals(ordinals) {
  const sorted = Array.from(new Set(ordinals.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;

  let longest = 1;
  let current = 1;
  let previous = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const day = sorted[index];
    if (day === previous + 1) {
      current += 1;
    } else {
      current = 1;
    }
    if (current > longest) longest = current;
    previous = day;
  }

  return longest;
}

function getUserLongestPlayStreak(db, userId) {
  const rows = db.prepare(`
    SELECT date_played
    FROM user_recently_played
    WHERE user_id = ?
      AND TRIM(COALESCE(date_played, '')) != ''
  `).all(userId);

  const ordinals = rows
    .map((row) => getDayOrdinal(row.date_played))
    .filter((value) => value !== null);

  return computeLongestStreakFromOrdinals(ordinals);
}

function awardTiersForValue(db, seriesKey, userId, value) {
  const series = db.prepare('SELECT id FROM achievement_series WHERE key = ?').get(seriesKey);
  if (!series) return 0;

  const tiers = db.prepare(`
    SELECT id, threshold
    FROM achievement_tiers
    WHERE series_id = ?
    ORDER BY threshold ASC
  `).all(series.id);
  if (!tiers.length) return 0;

  const insertAward = db.prepare(`
    INSERT OR IGNORE INTO achievement_awards (tier_id, user_id, awarded_at)
    VALUES (?, ?, datetime('now'))
  `);

  let awarded = 0;
  for (const tier of tiers) {
    if (value >= (parseInt(tier.threshold, 10) || 0)) {
      awarded += insertAward.run(tier.id, userId).changes;
    }
  }
  return awarded;
}

function getTotalPumpsForUser(db, userId) {
  const result = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM post_pumps pp JOIN user_posts up ON pp.post_id = up.id WHERE up.user_id = ?) +
      (SELECT COUNT(*) FROM upscore_pumps usp JOIN user_upscores us ON usp.upscore_id = us.id WHERE us.user_id = ?) +
      (SELECT COUNT(*) FROM new_clear_pumps ncp JOIN user_new_clears nc ON ncp.clear_id = nc.id WHERE nc.user_id = ?) +
      (SELECT COUNT(*) FROM comment_pumps cp JOIN post_comments pc ON cp.comment_type = 'post' AND cp.comment_id = pc.id WHERE pc.user_id = ?) +
      (SELECT COUNT(*) FROM comment_pumps cp JOIN upscore_comments uc ON cp.comment_type = 'upscore' AND cp.comment_id = uc.id WHERE uc.user_id = ?) +
      (SELECT COUNT(*) FROM comment_pumps cp JOIN new_clear_comments ncc ON cp.comment_type = 'clear' AND cp.comment_id = ncc.id WHERE ncc.user_id = ?) +
      (SELECT COUNT(*) FROM community_post_pumps cpp JOIN community_posts cpo ON cpp.post_id = cpo.id WHERE cpo.user_id = ?) +
      (SELECT COUNT(*) FROM community_comment_pumps ccp JOIN community_post_comments cpc ON ccp.comment_id = cpc.id WHERE cpc.user_id = ?) +
      (
        SELECT COUNT(*)
        FROM live_message_pumps lmp
        JOIN live_session_messages lsm ON lmp.message_id = lsm.id
        LEFT JOIN live_sessions ls ON ls.id = lsm.live_session_id
        WHERE CASE
          WHEN COALESCE(lsm.user_id, '') != '' THEN lsm.user_id
          WHEN lsm.message_type IN ('play', 'request_fulfilled') THEN COALESCE(ls.host_user_id, '')
          ELSE ''
        END = ?
      ) +
      (SELECT COUNT(*) FROM user_story_pumps usp WHERE usp.owner_user_id = ?)
      AS total
  `).get(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId);

  return parseInt(result?.total, 10) || 0;
}

function checkPumpAchievements(db, contentOwnerId) {
  try {
    const totalPumps = getTotalPumpsForUser(db, contentOwnerId);
    return awardTiersForValue(db, 'pumps_received', contentOwnerId, totalPumps);
  } catch {
    return 0;
  }
}

function checkStreakAchievements(db, userId) {
  try {
    const longestStreak = getUserLongestPlayStreak(db, userId);
    if (longestStreak <= 0) return 0;
    return awardTiersForValue(db, STREAK_SERIES_KEY, userId, longestStreak);
  } catch {
    return 0;
  }
}

function evaluatePumpAchievements(db) {
  const users = db.prepare('SELECT id FROM users').all();
  let awarded = 0;
  for (const user of users) {
    const totalPumps = getTotalPumpsForUser(db, user.id);
    awarded += awardTiersForValue(db, 'pumps_received', user.id, totalPumps);
  }
  return awarded;
}

function evaluateStreakAchievements(db) {
  const rows = db.prepare(`
    SELECT user_id, date_played
    FROM user_recently_played
    WHERE TRIM(COALESCE(date_played, '')) != ''
    ORDER BY user_id ASC
  `).all();

  const ordinalsByUser = new Map();
  for (const row of rows) {
    const ordinal = getDayOrdinal(row.date_played);
    if (ordinal === null) continue;
    if (!ordinalsByUser.has(row.user_id)) ordinalsByUser.set(row.user_id, []);
    ordinalsByUser.get(row.user_id).push(ordinal);
  }

  let awarded = 0;
  for (const [userId, ordinals] of ordinalsByUser.entries()) {
    const longestStreak = computeLongestStreakFromOrdinals(ordinals);
    if (longestStreak > 0) {
      awarded += awardTiersForValue(db, STREAK_SERIES_KEY, userId, longestStreak);
    }
  }
  return awarded;
}

function evaluateAchievementSeries(db, seriesKey) {
  switch (String(seriesKey || '').trim().toLowerCase()) {
    case 'pumps_received':
      return evaluatePumpAchievements(db);
    case STREAK_SERIES_KEY:
      return evaluateStreakAchievements(db);
    default:
      return 0;
  }
}

function ensureBuiltInAchievementSeries(db) {
  const findSeriesByKey = db.prepare('SELECT id, name, description FROM achievement_series WHERE key = ?');
  const insertSeries = db.prepare(`
    INSERT INTO achievement_series (id, key, name, description, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
  `);
  const backfillSeries = db.prepare(`
    UPDATE achievement_series
    SET
      name = CASE WHEN TRIM(COALESCE(name, '')) = '' THEN ? ELSE name END,
      description = CASE WHEN TRIM(COALESCE(description, '')) = '' THEN ? ELSE description END,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const listTiers = db.prepare(`
    SELECT id, threshold, name, description, image_data, sort_order
    FROM achievement_tiers
    WHERE series_id = ?
  `);
  const insertTier = db.prepare(`
    INSERT INTO achievement_tiers (
      id, series_id, threshold, name, description, image_data, sort_order, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
  `);
  const backfillTier = db.prepare(`
    UPDATE achievement_tiers
    SET
      name = CASE WHEN TRIM(COALESCE(name, '')) = '' THEN ? ELSE name END,
      description = CASE WHEN TRIM(COALESCE(description, '')) = '' THEN ? ELSE description END,
      image_data = CASE WHEN TRIM(COALESCE(image_data, '')) = '' THEN ? ELSE image_data END,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const seedTxn = db.transaction(() => {
    for (const series of BUILT_IN_ACHIEVEMENT_SERIES) {
      const existingSeries = findSeriesByKey.get(series.key);
      const seriesId = existingSeries?.id || series.id;
      if (!existingSeries) {
        insertSeries.run(seriesId, series.key, series.name, series.description);
      } else {
        backfillSeries.run(series.name, series.description, seriesId);
      }

      const existingTiers = listTiers.all(seriesId);
      const tierByThreshold = new Map(
        existingTiers.map((tier) => [parseInt(tier.threshold, 10) || 0, tier])
      );

      for (const tier of series.tiers) {
        const existingTier = tierByThreshold.get(tier.threshold);
        if (!existingTier) {
          insertTier.run(
            tier.id,
            seriesId,
            tier.threshold,
            tier.name,
            tier.description,
            tier.image_data,
            tier.sort_order
          );
          continue;
        }

        backfillTier.run(tier.name, tier.description, tier.image_data, existingTier.id);
      }
    }
  });

  seedTxn();
}

module.exports = {
  checkPumpAchievements,
  checkStreakAchievements,
  ensureBuiltInAchievementSeries,
  evaluateAchievementSeries,
};
