# Weekly Challenge Summary Post

## Context

After each weekly challenge finalizes (Monday 00:00 Europe/London rollover), publish an official summary post to the social feed. "Sports-broadcast recap meets arcade medal case" — podiums, new superlative awards, replay highlights, and a CTA to the new week. Uses the existing `[[MARKER]]` pattern so pumps, comments, sharing, profile pages, and single-post pages come for free.

---

## Files to Create

| File | Purpose |
|------|---------|
| `server/lib/weeklyChallengeSummary.js` | Build immutable summary payload from finalized data |
| `server/lib/weeklyChallengeSummaryMarker.js` | Server-side serialize/parse/split for `[[SHINSA_WC_SUMMARY_V1:...]]` |
| `client/src/utils/weeklyChallengeSummaryMarker.js` | Client-side serialize/parse/split (mirrors sessionShareMarker.js) |
| `client/src/components/WeeklyChallengeSummaryPostCard.jsx` | 5-page paginated card component |

## Files to Modify

| File | Change |
|------|--------|
| `server/db/schema.js` | Migrations: 4 new columns on `user_posts`, new `weekly_challenge_superlatives` table, system user seed with existence check |
| `server/lib/weeklyChallenges.js` | Atomic rollover with summary repair on fast path |
| `server/routes/social.js` | Feed UNION global branch + `stripSessionSummaryMarkers` + recent activity exclusion + system-user notification bypass + system-user filtered from recent signups |
| `server/routes/auth.js` | Early username normalization + reserved-name block + marker stripping in profile activity `textSnippet` |
| `server/sharePreviews.js` | Marker stripping + system-user branded OG title + system-user branded preview image |
| `client/src/components/PostCard.jsx` | Parse `WC_SUMMARY` marker, render card, system-user header |

---

## 1. Schema Migrations (`server/db/schema.js`)

### 1a. New columns on `user_posts` (after line 2078)

```sql
ALTER TABLE user_posts ADD COLUMN post_kind TEXT DEFAULT NULL;
ALTER TABLE user_posts ADD COLUMN source_week_id INTEGER DEFAULT NULL;
ALTER TABLE user_posts ADD COLUMN target_week_id INTEGER DEFAULT NULL;
ALTER TABLE user_posts ADD COLUMN content_hash TEXT DEFAULT NULL;
```

Idempotency index:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_wc_summary
  ON user_posts(post_kind, source_week_id)
  WHERE post_kind = 'weekly_challenge_summary';
```

### 1b. New table (after line 3766)

```sql
CREATE TABLE IF NOT EXISTS weekly_challenge_superlatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL REFERENCES weekly_challenge_weeks(id) ON DELETE CASCADE,
  reward_key TEXT NOT NULL,       -- most_sss | highest_clear_percentage | highest_clear_rating | biggest_improvements
  rank INTEGER NOT NULL,          -- 1-3
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value REAL NOT NULL DEFAULT 0,
  detail_json TEXT DEFAULT '{}',
  username_snapshot TEXT DEFAULT '',
  avatar_snapshot TEXT DEFAULT '',
  nationality_snapshot TEXT DEFAULT '',
  UNIQUE(week_id, reward_key, rank)
);
```

### 1c. System user (after line 3795)

The `users.username` column has a UNIQUE constraint. `INSERT OR IGNORE` silently no-ops if any row (even a different user) already owns the username, leaving no system user row. Fix: seed by primary key, handle username collision with a suffixed fallback, treat "existing row with fallback username" as a valid steady state on restart, and verify the row exists:

```js
const SYSTEM_USER_ID = '__shinsa_system__';
const PREFERRED_SYSTEM_USERNAME = '__shinsa__';

// Check if system user row already exists (from a previous boot)
const existingSystemUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(SYSTEM_USER_ID);

if (!existingSystemUser) {
  // First boot: try preferred username, fall back to timestamped name if taken
  const preferredTaken = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(PREFERRED_SYSTEM_USERNAME);
  const systemUsername = preferredTaken
    ? `__shinsa_${Date.now()}__`
    : PREFERRED_SYSTEM_USERNAME;

  if (preferredTaken) {
    console.warn(`[Schema] System user using fallback username '${systemUsername}' — '${PREFERRED_SYSTEM_USERNAME}' is taken by user ${preferredTaken.id}`);
  }

  db.prepare(`
    INSERT INTO users (id, username, password_hash, is_admin, avatar, description)
    VALUES (?, ?, '', 0, 'system', 'Official Shinsa updates')
  `).run(SYSTEM_USER_ID, systemUsername);
} else {
  // Row exists from a previous boot. Try to upgrade to preferred username if available,
  // but DO NOT force-rename if preferred is still taken — keep the fallback username.
  if (existingSystemUser.username !== PREFERRED_SYSTEM_USERNAME) {
    const preferredTaken = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?')
      .get(PREFERRED_SYSTEM_USERNAME, SYSTEM_USER_ID);
    if (!preferredTaken) {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(PREFERRED_SYSTEM_USERNAME, SYSTEM_USER_ID);
    }
    // else: preferred still taken, keep current fallback — this is a valid steady state
  }
}

// Hard check: system user MUST exist
const systemUserRow = db.prepare('SELECT id FROM users WHERE id = ?').get(SYSTEM_USER_ID);
if (!systemUserRow) {
  throw new Error(`[Schema] FATAL: System user '${SYSTEM_USER_ID}' could not be created.`);
}
```

Key behaviors:
- **Fresh DB**: inserts with preferred username `__shinsa__`
- **Fresh DB, preferred taken**: inserts with timestamped fallback, logs warning
- **Restart, row exists with preferred name**: no-op
- **Restart, row exists with fallback name, preferred still taken**: no-op (valid steady state)
- **Restart, row exists with fallback name, preferred now free**: upgrades to preferred
- **All paths**: hard existence check throws fatal on failure

Export `SYSTEM_USER_ID` from `schema.js`.

### 1d. Registration: early normalization + reserved-name block (`server/routes/auth.js`)

The current registration route does not normalize `username` before validation. A request like `' __shinsa__ '` bypasses the reserved check and uniqueness lookup, then hits a raw UNIQUE constraint error at insert time. Fix: normalize once at the top and use the normalized value everywhere:

```js
router.post('/register', (req, res) => {
  const db = getDb();
  // ... destructure req.body ...

  // Normalize username once — trim whitespace, used for all checks and insert
  const normalizedUsername = String(username || '').trim();

  if (!normalizedUsername || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (normalizedUsername.length < 2 || normalizedUsername.length > 30) {
    return res.status(400).json({ error: 'Username must be 2-30 characters' });
  }

  // Reserved names (case-insensitive, checked against normalized input)
  const RESERVED_USERNAMES = ['__shinsa__'];
  if (RESERVED_USERNAMES.some(r => r.toLowerCase() === normalizedUsername.toLowerCase())) {
    return res.status(400).json({ error: 'Username is reserved' });
  }

  // Existing uniqueness check (already case-insensitive)
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(normalizedUsername);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  // ... rest uses normalizedUsername for INSERT and everywhere else ...
```

---

## 2. Summary Builder (`server/lib/weeklyChallengeSummary.js`)

### Main export

```js
function buildWeeklyChallengeSummary(db, weekId, targetWeekId = null) → { payload, contentHash } | null
```

The `targetWeekId` parameter is the resolved successor week. The builder uses it to load `nextWeek` preview charts for page 5. The caller (`publishWeeklyChallengeSummary`) also stores the same value in `user_posts.target_week_id`, keeping the stored metadata and payload consistent.

### Steps

1. Load finalized week — return null if not finalized or 0 participants
2. Load frozen awards, leaderboard (scope='both'), all results joined to charts + snapshots
3. Compute aggregates: `participantCount`, `totalClears`, `chartCount`
4. **Clear stale superlatives** for this week_id before recomputing: `DELETE FROM weekly_challenge_superlatives WHERE week_id = ?`
5. Compute superlatives → persist to `weekly_challenge_superlatives`
6. Select replay highlights (3-5, player-diverse)
7. If `targetWeekId` is provided, load that week + first 6 charts for `nextWeek` preview. If null, set `payload.nextWeek = null`.
8. SHA-256 content hash for idempotency

### Superlative Definitions

- **most_sss**: `COUNT(*) WHERE resolved_grade IN ('SSS','SSS+')` per user, ranked DESC
- **highest_clear_percentage**: `clears / week.chart_count * 100`, from frozen leaderboard (scope='both')
- **highest_clear_rating**: `AVG(rating_points)` per user across their results, `HAVING COUNT(*) >= 3`, ranked DESC. This is average per clear, not total — total is already the Overall podium.
- **biggest_improvements**: For each user+chart, `final_score - pre_week_best`. Pre-week best is the highest score from a **passing play** (non-F grade) before the week started. Charts with no prior passing play are excluded — this is a "beat your old score" award, not a "first clear" award. Uses `COALESCE(NULLIF(played_at_utc, ''), date_played) < week.starts_at_utc` to handle legacy rows missing `played_at_utc`. Chart matching uses the same 3-tier alias resolution as `aggregateWeeklyResults`: `makeChartKey` + direct title + background_url fallback. Sum positive deltas per user, rank by total_delta DESC.

### Replay Highlight Selection

1. Join `weekly_challenge_results.source_play_id` → `user_recently_played` for replay fields
2. Filter to rows with `replay_embed_url` or `replay_video_id`
3. Score: award placement (+20-50), `min(rating_points/100, 30)`, grade quality (+10-15 for SSS/SS), improvement delta bonus (+0-20)
4. Sort DESC, enforce max 2 highlights per player, select 3-5 total
5. Each highlight includes: user info, song/chart info, score/grade/rating, replay fields, highlight_reason string

### Payload Shape

```js
{
  version: 1,
  weekId, weekKey, weekLabel, startsAtUtc, endsAtUtc,
  participantCount, totalClears, chartCount,
  topOverallPodium: [{ rank, user_id, username, avatar, nationality, skill_title, points, clears }],
  awards: { overall, singles, doubles, advanced, intermediate },
  superlatives: { most_sss, highest_clear_percentage, highest_clear_rating, biggest_improvements },
  replayHighlights: [{ user_id, username, avatar, nationality, song_title, mode, level, jacket_url, score, grade, rating_points, replay_embed_url, replay_video_id, replay_start_seconds, replay_end_seconds, highlight_reason }],
  nextWeek: { weekId, weekKey, weekLabel, previewCharts: [{ song_title, mode, level, jacket_url }] } | null,
  generatedAt
}
```

---

## 3. Server Marker (`server/lib/weeklyChallengeSummaryMarker.js`)

Pattern matches `server/lib/liveSessionMarker.js`:
- Marker: `[[SHINSA_WC_SUMMARY_V1:base64]]`
- `Buffer.from(JSON.stringify(payload),'utf8').toString('base64')` encoding
- Exports: `serializeWcSummaryMarker`, `parseWcSummaryMarker`, `splitWcSummaryContent`

---

## 4. Publishing Hook (`server/lib/weeklyChallenges.js`)

### New function

```js
function publishWeeklyChallengeSummary(db, weekId, nextWeekId) {
  // Idempotent: skip if post_kind='weekly_challenge_summary' + source_week_id already exists
  // Build payload via buildWeeklyChallengeSummary()
  // Serialize to marker string
  // INSERT INTO user_posts (user_id=SYSTEM_USER_ID, content=marker, post_kind, source_week_id, target_week_id, content_hash)
}
```

### New repair function

The repair function resolves each missing week's actual successor, not blindly using the current week. This keeps `user_posts.target_week_id` and `payload.nextWeek` consistent — a Week 12 summary always points at Week 13, not whatever week happens to be current when repair runs.

It also filters to finalized weeks that actually had participants. Without this, empty finalized weeks (0 participants) stay "missing" forever — `buildWeeklyChallengeSummary` returns null for them, so no post is created, but the repair query would re-select them on every fast-path request. The `EXISTS` join on `weekly_challenge_leaderboard` ensures only populated weeks are candidates.

```js
function repairMissingSummaryPosts(db) {
  // Only repair finalized weeks that had participants (skip empty weeks)
  const missing = db.prepare(`
    SELECT w.id, w.ends_at_utc FROM weekly_challenge_weeks w
    WHERE w.status = 'finalized'
      AND EXISTS (
        SELECT 1 FROM weekly_challenge_leaderboard lb WHERE lb.week_id = w.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_posts p
        WHERE p.post_kind = 'weekly_challenge_summary' AND p.source_week_id = w.id
      )
  `).all();
  for (const m of missing) {
    // Find the actual successor week
    const successor = db.prepare(`
      SELECT id FROM weekly_challenge_weeks
      WHERE starts_at_utc >= ?
      ORDER BY starts_at_utc ASC LIMIT 1
    `).get(m.ends_at_utc);
    const targetWeekId = successor ? successor.id : null;
    try { publishWeeklyChallengeSummary(db, m.id, targetWeekId); }
    catch (err) { console.error(`[WC Summary] repair failed for week ${m.id}:`, err); }
  }
}
```

`publishWeeklyChallengeSummary` passes `targetWeekId` through to `buildWeeklyChallengeSummary(db, weekId, targetWeekId)`. The builder uses it for `payload.nextWeek`; the publisher stores it in `user_posts.target_week_id`. If null (no successor yet), `payload.nextWeek = null` and page 5 shows a fallback.

### Hook location — atomic rollover + fast-path repair

The rollover wraps finalize → create → publish in a transaction. But if `publishWeeklyChallengeSummary` fails during rollover and the error is only logged, the new week already exists and the fast path (`if (week) return week`) means the app never retries. Fix: add a lightweight repair check on the fast path that catches finalized weeks missing their summary post.

**Race safety note**: The app runs as a single Node.js process (no cluster/PM2). `better-sqlite3`'s `db.transaction()` uses plain `BEGIN` (deferred) by default — NOT `BEGIN IMMEDIATE`. To get the write-lock-at-start semantics needed here, use `.immediate()` on the transaction. With WAL mode (`PRAGMA journal_mode = WAL` at schema.js:14), this serializes concurrent write transactions within the process. The re-check inside the transaction is a safety belt for correctness.

```js
function ensureCurrentWeeklyChallengeWeek(db, now = new Date()) {
  const { weekKey, startsAtUtc, endsAtUtc } = getWeekBoundary(now);

  // Fast path: week already exists
  let week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
  if (week) {
    // Repair: publish summaries for any finalized weeks that failed during rollover
    repairMissingSummaryPosts(db);
    return week;
  }

  // Atomic rollover: finalize + create + publish in one IMMEDIATE transaction
  // .immediate() uses BEGIN IMMEDIATE to acquire the write lock up front
  const rollover = db.transaction(() => {
    // Re-check inside transaction (another request may have won the race)
    let w = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
    if (w) return w;

    // Phase 1: Finalize previous active weeks
    const activeWeeks = db.prepare(
      "SELECT * FROM weekly_challenge_weeks WHERE status = 'active' AND week_key != ?"
    ).all(weekKey);
    for (const aw of activeWeeks) {
      finalizeWeek(db, aw.id);
    }

    // Phase 2: Create the new week
    const maxLevel = getGlobalChallengeMaxLevel(db);
    const result = db.prepare(`
      INSERT INTO weekly_challenge_weeks (week_key, starts_at_utc, ends_at_utc, challenge_max_level)
      VALUES (?, ?, ?, ?)
    `).run(weekKey, startsAtUtc, endsAtUtc, maxLevel);
    w = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(result.lastInsertRowid);
    selectWeeklyCharts(db, w);
    w = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(w.id);

    // Phase 3: Publish summaries (new week now exists as target)
    for (const aw of activeWeeks) {
      try { publishWeeklyChallengeSummary(db, aw.id, w.id); }
      catch (err) { console.error(`[WC Summary] publish failed for week ${aw.id}:`, err); }
    }

    return w;
  });

  return rollover.immediate();
}
```

The `repairMissingSummaryPosts` call on the fast path is cheap — one SELECT with NOT EXISTS, zero writes when healthy. On the next request after a failed publish, it auto-retries. `publishWeeklyChallengeSummary` is already idempotent, so repeated repair calls are safe.

---

## 5. Marker Stripping — All Server-Side Surfaces

### 5a. `server/routes/social.js` line 40 — `stripSessionSummaryMarkers()`

Add the WC summary regex to the chain:

```js
function stripSessionSummaryMarkers(text) {
  return String(text || '')
    .replace(/\[\[SHINSA_WC_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')  // NEW
    .replace(/\[\[SHINSA_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_SHARE_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_LIVE_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_SESSION_PLAN_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .trim();
}
```

### 5b. `server/sharePreviews.js` line 73 — `stripPreviewMarkers()`

Add matching regex:

```js
.replace(/\[\[SHINSA_WC_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')  // NEW
```

### 5c. `server/routes/auth.js` line 59 — profile activity `textSnippet()`

This file has its own `textSnippet()` that does **no** marker stripping. The profile activity API at line 2213 passes raw `post.content` through it, so `[[SHINSA_WC_SUMMARY_V1:...]]` would leak into the detail field. Fix: add a broad stripping regex that's future-proof against any new marker types:

```js
function textSnippet(text, max = 90) {
  const compact = String(text || '')
    .replace(/\[\[SHINSA_[A-Z0-9_]+_V\d+:[A-Za-z0-9+/=_-]+\]\]/g, '')  // strip all markers
    .replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}
```

### 5d. `server/sharePreviews.js` line 1848 — OG HTML title for system-user posts

Currently: `@${post.username} on Pump Shinsa`. For system-user summary posts, this would render as `@__shinsa__ on Pump Shinsa`. Fix:

```js
const isSystemPost = post.user_id === SYSTEM_USER_ID;
const title = isSystemPost
  ? 'Weekly Challenge Recap — Pump Shinsa'
  : (post.username ? `@${post.username} on Pump Shinsa` : 'Pump Shinsa Post');
```

Also update `summarizePostContent()` to handle WC summary posts:

```js
const { summary: wcSummary } = splitWcSummaryContent(post?.content || '');
if (wcSummary) {
  return textSnippet(`${wcSummary.weekLabel} — ${wcSummary.participantCount} players, ${wcSummary.totalClears} clears`, maxLen);
}
```

### 5e. `server/sharePreviews.js` line 1796 — OG JPEG preview image branding

The post OG image route at line 1796 calls `buildBrandAssets({ username: post.username })`, which at line 667 renders `@__shinsa__` in the image's top-right brand slot. Fix: override `usernameLabel` for system-user posts:

```js
// At line 1796, when building brand assets for a post:
const isSystemPost = post.user_id === SYSTEM_USER_ID;
const brandAssets = await buildBrandAssets({
  clientBuildDir,
  origin,
  username: isSystemPost ? '' : post.username,  // empty → defaults to no username label
  avatar: isSystemPost ? '' : post.avatar,
  userId: post.user_id,
  avatarVersion: post.avatar_v || 0,
});
// Override the label for system posts to show "Shinsa" instead of @player
if (isSystemPost) {
  brandAssets.usernameLabel = 'Shinsa';
}
```

This makes the JPEG show "Shinsa" in the brand slot instead of `@__shinsa__` or `@player`.

Import `SYSTEM_USER_ID` and `splitWcSummaryContent` at top of `sharePreviews.js`.

---

## 6. Feed Global Visibility (`server/routes/social.js`, line 1413)

Split the posts UNION branch into two:

```sql
-- Regular posts (followed + self, exclude summaries)
SELECT 'post' as type, p.id, p.created_at
FROM user_posts p
WHERE (p.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?) OR p.user_id = ?)
  AND (p.post_kind IS NULL OR p.post_kind != 'weekly_challenge_summary')

UNION ALL

-- WC summary posts (global, no follow filter)
SELECT 'post' as type, p.id, p.created_at
FROM user_posts p
WHERE p.post_kind = 'weekly_challenge_summary'
```

Net change to bind params: +0.

### Recent Activity exclusion — two surfaces

**6a. Recent signups** (`server/routes/social.js` line 2158): Filter system user from signup announcements with `WHERE id != ?` binding `SYSTEM_USER_ID`:

```sql
SELECT id, username, avatar, nationality, created_at
FROM users
WHERE id != ?
ORDER BY created_at DESC LIMIT 10
```

**6b. Recent activity posts section** (if it queries `user_posts`): Add `AND (post_kind IS NULL OR post_kind != 'weekly_challenge_summary')` to exclude summary posts.

---

## 7. System-User Interaction Bypass (`server/routes/social.js`)

### 7a. Post pump handler (line 1126-1131)

Skip notification and achievement check when the post owner is the system user:

```js
const isSystemPost = post.user_id === SYSTEM_USER_ID;

if (!isSystemPost && post.user_id !== req.user.id) {
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  createNotification(db, post.user_id, 'post_pump', 'New Pump', `${me.username} pumped your post`, `/post/${postId}`);
}
if (!isSystemPost) {
  checkPumpAchievements(db, post.user_id);
}
```

### 7b. Post comment handler (line 1279-1281)

Skip owner notification when the post owner is the system user:

```js
if (post.user_id !== req.user.id && post.user_id !== SYSTEM_USER_ID) {
  createNotification(db, post.user_id, 'post_comment', 'New Comment', `${me.username} commented on your post`, commentLink);
}
```

Import `SYSTEM_USER_ID` from `../db/schema` at the top of social.js.

---

## 8. Client Marker (`client/src/utils/weeklyChallengeSummaryMarker.js`)

Pattern matches `client/src/utils/sessionShareMarker.js`:
- Uses `encodeUnicodeBase64` / `decodeUnicodeBase64` for browser-safe encoding
- `sanitizeWcSummary()` validates/coerces all fields
- Exports: `serializeWcSummaryMarker`, `parseWcSummaryMarker`, `splitWcSummaryContent`

---

## 9. PostCard Integration (`client/src/components/PostCard.jsx`)

### Parsing (after existing chain ~line 913)

Add `splitWcSummaryContent` as the **first** step in the parse chain:

```js
const wcSummarySplit = useMemo(() => splitWcSummaryContent(currentContent), [currentContent]);
const parsedSummary = useMemo(() => splitSessionSummaryContent(wcSummarySplit.text || ''), [wcSummarySplit.text]);
// ... rest unchanged, all feed from wcSummarySplit.text instead of currentContent
```

### Rendering (~line 1087)

```jsx
{currentWcSummary && <WeeklyChallengeSummaryPostCard summary={currentWcSummary} className="mb-3" />}
```

### System user header

When `post.user_id === '__shinsa_system__'`, render a branded "Shinsa" header (icon + name, no profile link) instead of the normal avatar/username/flag.

---

## 10. Summary Card Component (`client/src/components/WeeklyChallengeSummaryPostCard.jsx`)

5-page paginated card. "Sports-broadcast recap meets arcade medal case."

### Page 1: Hero Recap
- Week label header with trophy icon
- Stats row: participant count, total clears, chart count
- Top 3 overall podium (reuse gold/silver/bronze from `WeeklyChallengePodiumStrip.jsx`)
- "New weekly is live" CTA → `/weekly-challenges`

### Page 2: Full Podiums
- All 5 award categories with medal rows (overall, singles, doubles, advanced, intermediate)
- Reuse `AWARD_LABELS` and `PODIUM_COLORS` from `WeeklyChallengePodiumStrip.jsx`

### Page 3: Reward Wall (Superlatives)
- 4 tiles: Most SSS, Highest Clear %, Highest Avg Rating, Biggest Improvements
- Each shows winner avatar, username, value badge, highlight reason
- Gold/silver/bronze for ranks 1-3

### Page 4: Replay Highlights
- 3-5 clips with jacket, song title, player, score/grade/rating, highlight reason
- Replay button opens `YouTubeReplayModal` (same pattern as `SessionShareCard.jsx`)
- Fallback "No replays this week" if empty

### Page 5: Next Week CTA
- Week label + date range
- Grid of preview chart jackets (up to 6)
- "Jump into the new weekly" button → `/weekly-challenges`
- Fallback if nextWeek is null

### Pagination
- Bottom bar: left/right arrows + 5 dot indicators (active = `text-piu-gold`)
- Touch swipe via `onTouchStart`/`onTouchEnd`
- Mirrors `SessionShareCard` pagination UX

---

## Implementation Order

1. Schema migrations + system user seed (with collision handling + existence check) + registration normalization + reserved-name block
2. `server/lib/weeklyChallengeSummaryMarker.js` (server marker)
3. `server/lib/weeklyChallengeSummary.js` (builder + superlatives with clear-before-write + replay selection)
4. Publishing hook + repair function + atomic rollover in `server/lib/weeklyChallenges.js`
5. Marker stripping across all 3 server files (`social.js`, `sharePreviews.js`, `auth.js`)
6. OG title + OG JPEG branding for system-user posts in `sharePreviews.js`
7. Feed exception + recent activity exclusion (both signup and post surfaces) in `server/routes/social.js`
8. System-user notification/achievement bypass in `server/routes/social.js`
9. `client/src/utils/weeklyChallengeSummaryMarker.js` (client marker)
10. PostCard.jsx integration
11. `WeeklyChallengeSummaryPostCard.jsx` (5-page card)

---

## Verification

1. **Manual rollover test**: Call `ensureCurrentWeeklyChallengeWeek(db, futureDate)` with a date in next week. Verify:
   - Previous week finalized
   - New week created with charts
   - Exactly one summary post with `post_kind='weekly_challenge_summary'`, `source_week_id` = old, `target_week_id` = new
   - Calling again produces no duplicate (idempotent)
   - `weekly_challenge_superlatives` populated with 4 reward_keys × up to 3 ranks
   - Superlatives clean on rebuild: run builder twice, verify no stale rows

2. **Publish failure recovery**: Simulate a failed publish (throw in `publishWeeklyChallengeSummary`), then call `ensureCurrentWeeklyChallengeWeek` again. Verify `repairMissingSummaryPosts` catches it on the fast path. Verify `user_posts.target_week_id` matches the actual successor week (not the current week), and `payload.nextWeek.weekId` agrees with the stored `target_week_id`.

3. **Race safety**: Simulate two concurrent rollover calls. Verify only one week + one summary post created (`.immediate()` transaction + WAL).

4. **Feed visibility**: `/api/social/feed` as user NOT following system user → summary post appears. Verify NOT in recent activity. Verify no "joined Pump Shinsa" card for `__shinsa__`.

5. **Snippet safety across all surfaces**:
   - Notification snippet (social.js `textSnippet`) → no raw marker
   - OG HTML title (sharePreviews.js) → "Weekly Challenge Recap — Pump Shinsa", not `@__shinsa__`
   - OG JPEG image (sharePreviews.js) → brand slot shows "Shinsa", not `@__shinsa__`
   - Profile activity (auth.js `/api/auth/user/:id/activity`) → no raw marker in detail field

6. **Interaction bypass**: Pump and comment on a summary post. Verify no notifications created for `__shinsa_system__`, no pump achievement churn.

7. **System user protection**:
   - Fresh DB: system user row exists after init with preferred username
   - Fresh DB, preferred taken: seed uses timestamped fallback, logs warning, row still exists
   - Restart, row exists with fallback, preferred still taken: no-op (valid steady state, no UNIQUE crash)
   - Restart, row exists with fallback, preferred now free: upgrades to preferred
   - Registration `' __shinsa__ '` (whitespace-padded): 400 "Username is reserved" (normalized before check)
   - Registration `__SHINSA__` (case variation): 400 "Username is reserved"

8. **Card rendering**: All 5 pages render with working pagination, correct podiums, superlatives, and replay buttons.

9. **Edge cases**: Empty week (0 participants) → no post. No replays → page 4 fallback. No next week → page 5 fallback. biggest_improvements: chart with no prior pass excluded, legacy rows without `played_at_utc` still matched via `date_played` fallback. Fewer than 3 users meeting highest_clear_rating threshold → fewer than 3 superlative rows (no stale leftovers).

10. **Build + deploy**: `NODE_OPTIONS=--max-old-space-size=4096 npm run build`, deploy to production, verify on live feed.
