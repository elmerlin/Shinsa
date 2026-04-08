# Story Archive Page - Implementation Plan

## Overview

Build a full-page Story Archive at `/stories/archive` with two views (Grid and Calendar), replacing the existing basic `StoryArchiveModal` as the primary archive experience. The page will reuse the existing `StoryViewerModal` for viewing archived stories.

---

## 1. Server-Side API Changes

### 1a. Add pagination to the archive endpoint

**File:** `/Users/elmerlin/shinsa/server/routes/messages.js` (line ~1644)

The current `GET /highlights/archive` endpoint calls `getArchivedStories(db, req.user.id)` which has a hard `LIMIT 100` and no cursor/offset support. Add cursor-based pagination using `archived_at` as the cursor (already indexed via `idx_user_story_archives_owner`).

New query parameters:
- `before` (optional): ISO datetime string — return stories archived before this timestamp
- `limit` (optional): Number of stories to return. Default 50, max 200

The SQL becomes:
```sql
SELECT story_id, story_payload_json, archived_at, original_created_at
FROM user_story_archives
WHERE owner_user_id = ?
  AND (? IS NULL OR datetime(archived_at) < datetime(?))
ORDER BY datetime(archived_at) DESC, story_id DESC
LIMIT ?
```

Response shape:
```js
{
  stories: [{ archived_at, original_created_at, story: {...} }, ...],
  has_more: boolean,
  next_cursor: "2025-01-15T10:00:00" // archived_at of last item
}
```

**Critical:** Also surface `original_created_at` in the response (stored in DB but not currently returned). This is needed for calendar grouping — stories should appear on the day they were originally created, not archived.

### 1b. Add `getArchivedStoriesPaginated` function

Place alongside the existing `getArchivedStories` (line ~575 of messages.js). The existing function remains unchanged so the old modal works during transition.

### 1c. No new calendar-grouping endpoint needed

Grouping happens client-side. The dataset is bounded per user (typically dozens to low hundreds), so fetching all pages and grouping in JS is fine.

---

## 2. Client-Side API Utility

**File:** `/Users/elmerlin/shinsa/client/src/utils/api.js`

Add alongside existing `getMessageStoryArchive` (line 729):

```js
export const getMessageStoryArchivePage = (options = {}) => {
  const params = new URLSearchParams();
  if (options.before) params.set('before', options.before);
  if (options.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return request(`/messages/highlights/archive${qs ? '?' + qs : ''}`);
};
```

The existing `getMessageStoryArchive` stays untouched for backward compatibility.

---

## 3. New Page Component

**File:** `/Users/elmerlin/shinsa/client/src/pages/StoryArchivePage.jsx` (new)

### Component Tree

```
StoryArchivePage (default export)
├── StickyHeader (back nav, "Stories Archive" title, grid/calendar toggle)
├── GridView (conditional on view === 'grid')
│   ├── DateGroupHeader (full-width row: "Mar 15" / "Today")
│   └── 3-column thumbnail cells
├── CalendarView (conditional on view === 'calendar')
│   └── MonthCalendar × N
│       ├── Month/year header
│       ├── Day-of-week labels (M T W T F S S)
│       └── 7-column day grid with circular thumbnails
├── StoryViewerModal (imported from InboxHighlightsStrip)
└── Loading / Empty states
```

### State

```js
const [view, setView] = useState('grid');
const [stories, setStories] = useState([]);
const [loading, setLoading] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);
const [hasMore, setHasMore] = useState(false);
const [nextCursor, setNextCursor] = useState(null);
const [error, setError] = useState('');
const [viewerOpen, setViewerOpen] = useState(false);
const [viewerStories, setViewerStories] = useState([]);
const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
```

### Data Flow

1. On mount, fetch first page via `getMessageStoryArchivePage({ limit: 50 })`.
2. Store in `stories`. Each entry: `{ archived_at, original_created_at, story: {...} }`.
3. Grid view: render in order, inserting date headers when the date changes.
4. Calendar view: group all stories by `original_created_at` into `Map<YYYY-MM-DD, story[]>`, render month calendars.
5. Grid infinite scroll: sentinel div + `IntersectionObserver` triggers `loadMore()`.
6. Calendar view: eagerly load all pages on mount (needs all dates for complete calendar).

---

## 4. Route Registration

**File:** `/Users/elmerlin/shinsa/client/src/App.jsx`

Add lazy import (around line 67):
```js
const StoryArchivePage = lazy(() => import('./pages/StoryArchivePage'));
```

Add route (around line 1501, near `/messages` routes):
```jsx
<Route path="/stories/archive" element={<StoryArchivePage />} />
```

---

## 5. Grid View Details

### Thumbnail Cell

- Container: `aspect-[3/4] rounded-lg overflow-hidden relative cursor-pointer`
- Background: story's thumbnail image via `<img>` with `object-cover w-full h-full`
- Caption overlay: bottom gradient (`bg-gradient-to-t from-black/60`) with truncated caption
- Duration badge: bottom-left pill (future-proofing for video stories)
- Tap: opens `StoryViewerModal` at that story's index

### Grid Layout

```jsx
<div className="grid grid-cols-3 gap-0.5">
```

Tight 2px gap matches Instagram's grid aesthetic.

### Date Grouping Function

```js
function groupStoriesByDate(stories) {
  const groups = [];
  let currentDate = null;
  let currentGroup = null;
  for (const entry of stories) {
    const dateStr = entry.original_created_at || entry.archived_at;
    const date = dateStr ? new Date(dateStr).toLocaleDateString('en-CA') : 'unknown';
    if (date !== currentDate) {
      currentDate = date;
      currentGroup = { date, label: formatDateLabel(date), stories: [] };
      groups.push(currentGroup);
    }
    currentGroup.stories.push(entry);
  }
  return groups;
}

function formatDateLabel(dateKey) {
  const d = new Date(dateKey + 'T00:00:00');
  const now = new Date();
  const today = now.toLocaleDateString('en-CA');
  const yesterday = new Date(now - 86400000).toLocaleDateString('en-CA');
  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
```

### Infinite Scroll

```js
const sentinelRef = useRef(null);
useEffect(() => {
  if (!sentinelRef.current || !hasMore || loadingMore) return;
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) loadMore();
  }, { rootMargin: '200px' });
  observer.observe(sentinelRef.current);
  return () => observer.disconnect();
}, [hasMore, loadingMore]);
```

---

## 6. Calendar View Details

### Month Range Generation

```js
function getMonthRange(stories) {
  const now = new Date();
  const current = { year: now.getFullYear(), month: now.getMonth() };
  let oldest = { ...current };
  for (const entry of stories) {
    const d = new Date(entry.original_created_at || entry.archived_at);
    if (isNaN(d)) continue;
    const ym = { year: d.getFullYear(), month: d.getMonth() };
    if (ym.year < oldest.year || (ym.year === oldest.year && ym.month < oldest.month)) oldest = ym;
  }
  const months = [];
  let y = current.year, m = current.month;
  while (y > oldest.year || (y === oldest.year && m >= oldest.month)) {
    months.push({ year: y, month: m });
    if (--m < 0) { m = 11; y--; }
  }
  return months;
}
```

### Stories-by-Date Map

```js
const storiesByDate = useMemo(() => {
  const map = new Map();
  for (const entry of stories) {
    const d = new Date(entry.original_created_at || entry.archived_at);
    if (isNaN(d)) continue;
    const key = d.toLocaleDateString('en-CA');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  return map;
}, [stories]);
```

### MonthCalendar Sub-Component

Each month renders:
1. Header: "March 2026" in Rajdhani
2. Day labels: M T W T F S S (7 cols)
3. Day cells: Monday-based grid

Day cell behavior:
- Has stories: circular thumbnail (`rounded-full w-10 h-10 object-cover`), cyan border glow, tappable
- No stories: gray day number
- Outside month: empty

---

## 7. StoryViewerModal Integration

### Opening from Grid

```js
const handleOpenGridStory = (entry, globalIndex) => {
  const allStoryObjects = stories.map(e => e.story).filter(Boolean);
  setViewerStories(allStoryObjects);
  setViewerInitialIndex(globalIndex);
  setViewerOpen(true);
};
```

### Opening from Calendar Day

```js
const handleOpenDayStories = (dayStories) => {
  const storyObjects = dayStories.map(e => e.story).filter(Boolean);
  setViewerStories(storyObjects);
  setViewerInitialIndex(0);
  setViewerOpen(true);
};
```

### Viewer Props

```jsx
<StoryViewerModal
  open={viewerOpen}
  user={{ id: authUser.id, username: authUser.username, avatar: getAvatarUrl(authUser.avatar) }}
  stories={viewerStories}
  loading={false}
  error=""
  onClose={() => setViewerOpen(false)}
  readonly={true}
  initialIndex={viewerInitialIndex}
/>
```

`readonly={true}` matches existing behavior (MessagesPage line 4905). This disables auto-advance timer (line 901 of InboxHighlightsStrip.jsx), view tracking, and mark-as-viewed calls. User navigates manually by tapping left/right.

---

## 8. Header and Toggle Design

```jsx
<div className="sticky top-0 z-30 border-b border-white/8 bg-piu-bg/95 backdrop-blur-md px-4 py-3">
  <div className="flex items-center gap-3">
    <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/6 text-gray-400 hover:text-white">
      {/* chevron left SVG */}
    </button>
    <h1 className="flex-1 font-display text-xl font-black text-white">Stories Archive</h1>
    <div className="flex rounded-full border border-white/10 bg-white/6 p-0.5">
      <button onClick={() => setView('grid')}
        className={`rounded-full px-3 py-1.5 text-xs font-display font-bold ${view === 'grid' ? 'bg-cyan-500 text-white' : 'text-gray-400'}`}>
        Grid
      </button>
      <button onClick={() => setView('calendar')}
        className={`rounded-full px-3 py-1.5 text-xs font-display font-bold ${view === 'calendar' ? 'bg-cyan-500 text-white' : 'text-gray-400'}`}>
        Calendar
      </button>
    </div>
  </div>
</div>
```

---

## 9. Navigation Entry Point

**Recommended: Option B (non-breaking)**

Keep existing `StoryArchiveModal` working. Add a "View full archive" `<Link>` inside it (around line 762) that navigates to `/stories/archive` and closes the modal. This gives users both the quick-peek modal and the full page.

Change in `StoryArchiveModal`:
```jsx
<Link to="/stories/archive" onClick={onClose}
  className="text-xs font-display font-bold text-cyan-400 hover:text-cyan-300">
  View full archive →
</Link>
```

---

## 10. Changes Summary by File

| File | Change |
|------|--------|
| `server/routes/messages.js` | Add `getArchivedStoriesPaginated`, modify `/highlights/archive` to accept `before`/`limit` params, surface `original_created_at` |
| `client/src/utils/api.js` | Add `getMessageStoryArchivePage` function |
| `client/src/pages/StoryArchivePage.jsx` | **New file** — main archive page |
| `client/src/App.jsx` | Add lazy import + `<Route path="/stories/archive">` |
| `client/src/components/InboxHighlightsStrip.jsx` | Add "View full archive" link to `StoryArchiveModal` |

---

## 11. Thumbnail Resolution (shared logic)

```js
function getStoryThumbnail(story) {
  if (story?.media_url) return story.media_url;
  if (story?.snapshot?.jacket_url) return story.snapshot.jacket_url;
  if (story?.scores?.[0]?.jacket_url) return story.scores[0].jacket_url;
  return null;
}
```

Fallback for stories without thumbnails: gradient div with first letter of title (matching pattern at InboxHighlightsStrip.jsx line 795-797).

---

## 12. Loading and Empty States

**Grid loading:** 9 skeleton cells (3x3), `animate-pulse bg-white/8 aspect-[3/4] rounded-lg`

**Calendar loading:** 1-2 skeleton month grids with pulsing circles

**Empty state:** Centered with archive icon, matching existing pattern (InboxHighlightsStrip.jsx line 775):
```
No archived stories yet.
Stories you archive will appear here.
```

---

## 13. Implementation Sequence

1. Server-side: Add pagination params + `original_created_at` to archive endpoint
2. Client API: Add `getMessageStoryArchivePage` to api.js
3. Page component: Create `StoryArchivePage.jsx` with Grid view
4. Route: Register in App.jsx
5. Calendar view: Add calendar sub-component and toggle
6. Entry point: Add "View full archive" link to existing `StoryArchiveModal`
7. Polish: Test all story types, pagination, viewer integration

---

## 14. Potential Challenges

- **Base64 images in grid:** Stories use base64 data URLs. 50+ in a grid is memory-heavy. Mitigation: `loading="lazy"` on `<img>` tags. Consider virtualizing if perf issues arise.
- **`original_created_at` may be empty:** Schema allows empty string. Fallback to `archived_at`.
- **Viewer readonly behavior:** Confirmed correct — `readonly={true}` disables auto-advance (line 901), view tracking (line 930), and engagement calls. User navigates manually.
- **No cross-user navigation:** `hasPreviousUser`/`hasNextUser` should be `false` — all archived stories belong to the authenticated user.
