# Desktop design — Shinsa web build

Shinsa is one Expo Router + React Native Web codebase. Above ~960 px viewport
width it renders a **desktop-native** UI: persistent left sidebar, no bottom
tabs, master–detail and 12-column dashboards, right-rail context panels.
Below the breakpoint, the existing mobile UI renders byte-for-byte unchanged.

Native (iOS / Android) never enters the desktop branch — even tablets keep the
mobile UI, because that's the right answer there.

## Breakpoint

`mobile/hooks/use-breakpoint.ts` exposes the single hook the whole app uses to
decide which variant to render.

```ts
import { useBreakpoint } from '@/hooks/use-breakpoint';

const { isDesktop, isCompactSidebar, width } = useBreakpoint();
```

| Constant                       | Width    | Behavior                                                |
| ------------------------------ | -------- | ------------------------------------------------------- |
| `DESKTOP_BREAKPOINT`           | 960 px   | Below: mobile UI. At/above: desktop UI.                 |
| `SIDEBAR_EXPANDED_BREAKPOINT`  | 1100 px  | 960–1099: icon-only sidebar. ≥ 1100: icon + label.      |

`isDesktop` is **always false on native** (`Platform.OS !== 'web'`), regardless
of `width`. This is the gate. Never branch on `width` directly — branch on
`isDesktop` so native paths can't accidentally pick up desktop code.

## Shell architecture

```
app/_layout.tsx                AuthGate + theme + RN Query
└─ app/(drawer)/_layout.tsx    Drawer:
                                  desktop → drawerType='permanent', WebSidebar
                                  mobile  → drawerType='front', mobile DrawerContent
   └─ app/(drawer)/(tabs)/_layout.tsx
                                  desktop → tabBarStyle={display:'none'}
                                  mobile  → bottom tabs visible
```

The drawer stays as the host on both platforms. We don't rebuild routing — we
just reconfigure the same `<Drawer>` component:

- `drawerContent` swaps to `WebSidebar` on desktop, mobile content otherwise.
- `drawerType: 'permanent'` makes the desktop drawer always visible and inert.
- `drawerPosition: 'left'` on desktop (Linear/Notion convention).
- Width: 240 px expanded, 64 px compact.

Bottom tabs are hidden via `tabBarStyle.display = 'none'` so routing still
resolves to /(tabs)/index, /(tabs)/feed, etc., but the visual bar is gone.

`components/top-bar.tsx` (used by every drawer-hosted screen) drops the logo
and hamburger on desktop and renders only the right utility cluster
(messages, notifications). The logo lives in the sidebar.

## Sidebar pattern (`components/web/web-sidebar.tsx`)

Three sections, mirroring the mobile drawer: **App** (Home, Feed, Songs,
Tiers, Profile), **Discover** (Tournaments, Live, Weekly Challenges, Lists,
Training, What to Play, Rival, Skills, Leaderboards, Shoes, Messages, Posts),
**Account** (My Account). Log-out pinned to the bottom.

- Active route: gold accent bar on the left edge + `accentTint` row backdrop.
  Detected via `usePathname()`. Items with `prefix: true` match by prefix so
  `/profile/123` keeps Profile lit.
- Hover: `surfaceMuted` backdrop via `onHoverIn / onHoverOut` (RN Web extends
  Pressable with these — they no-op on native).
- Compact mode (960–1099 px): icon-only rows, brand collapses to the icon
  variant of the logo.

To add a sidebar entry, append to `SECTIONS` in `web-sidebar.tsx`. The icon
must be a valid SF Symbol name **and** be present in
`components/ui/icon-symbol.tsx`'s `MAPPING`. If you need a new icon, add the
SF name → Material name pair there first.

## Master–detail pattern

For list+detail screens (Songs, Tiers, Messages, Lists, Skills, Tournaments,
Shoes, Account, Weekly Challenges), the desktop layout is two columns:

```
┌─────────────┬────────────────────────────────┐
│ list / nav  │ selected item's detail pane    │
│ + filters   │                                │
│ (40%)       │ (60%)                          │
└─────────────┴────────────────────────────────┘
```

The selection lives in the URL query string (e.g. `/songs?selected=...`) so
it survives reload and back/forward. Mobile keeps the existing drill-down
navigation — selecting an item routes to a detail screen as before. The web
desktop component reads `useLocalSearchParams()` and renders the right pane
in-place.

## Right rails over bottom sheets

Bottom sheets (custom `<Modal>` instances in `components/*-sheet.tsx`) are
fine on mobile but wrong on desktop. On desktop, the same trigger should
either:

1. **Slide a 360–420 px right rail in** for contextual data (chart details,
   thread info, score breakdown) — this is the default.
2. **Open a centered modal** for confirm dialogs and short forms.

Never use a bottom-anchored sheet on desktop.

## Density

Mobile-first values are calibrated for fingers; desktop tightens up:

| Token         | Mobile  | Desktop |
| ------------- | ------- | ------- |
| Row height    | 44+ px  | 32–36 px |
| Gap           | 16 px   | 12 px   |
| Body font     | 15 px   | 13–14 px |
| Section gap   | 24 px   | 16 px   |

Hit targets shrink because we have hover and a cursor — the 44 px touch
minimum is pointless.

## Keyboard

Above the breakpoint, screens should bind:

| Key   | Action                                     |
| ----- | ------------------------------------------ |
| `/`   | Focus the screen's search field            |
| `J`   | Move selection down in the current list    |
| `K`   | Move selection up in the current list      |
| Enter | Open the currently selected row            |
| Esc   | Close the right rail or any open modal     |

Use `useEffect` to bind listeners on web only (`Platform.OS === 'web'`). The
top priority screens for keyboard nav are **Songs, Feed, Messages, Tiers**.

## Adding a new desktop screen

1. Read the mobile screen file (`app/(drawer)/.../foo.tsx`).
2. At the top of the screen component:
   ```tsx
   const { isDesktop } = useBreakpoint();
   if (isDesktop) return <FooDesktop />;
   // existing mobile JSX unchanged
   ```
3. Implement `FooDesktop` in the same file (small screens) or a sibling
   file like `app/(drawer)/foo.desktop.tsx` imported only inside the
   `isDesktop` branch (large screens). **Don't `.web.tsx`-split the route
   itself** — keep one file per route so navigation typing stays clean.
4. Stick to RN primitives (`View`, `Pressable`, `ScrollView`, `FlatList`).
   The only place a raw `<div>` is acceptable is `app/+html.tsx`. CSS
   `display: 'grid'` is allowed via `style` because RN Web passes it
   through, but reach for it sparingly.
5. Reuse: `useThemedStyles`, `theme.accent` / `theme.text` / `theme.border`,
   `PlateBadge`, `GradeChip`, `ChartJacket`, `PumpShinsaLogo`. Don't
   hardcode hex values.
6. For data, keep the existing TanStack Query call shape — don't fork queries
   per platform. If a desktop layout genuinely needs a new endpoint (e.g.
   cursor-paginated inbox), call it out as a follow-up issue.
7. Run `npx tsc --noEmit` from `mobile/` before pushing.

## Patterns shipped in the second pass

The Tiers / Songs detail / Profile / Lists detail / Weekly Challenges /
Training / What to Play / Feed / Tournaments work added a handful of
patterns that other future-desktop routes should copy.

### Master + detail + right rail (3-col)

Routes that have a *directory*, a *primary list*, and a *context panel*
land on a 3-col layout. Examples: **Lists detail** (240 px directory of
all lists / center list contents / 360 px chart-detail rail),
**Profile** (280 px identity / center tab body / 320 px Optimise rail).

```
┌───────────┬───────────────────────┬───────────┐
│ directory │ primary list / scroll │ rail      │
│ ~240 px   │                       │ ~320 px   │
└───────────┴───────────────────────┴───────────┘
```

The center column is the existing mobile scroll, untouched apart from
a `style={isDesktop ? { flex: 1 } : undefined}` on the ScrollView.
Both rails are siblings inside a `flexDirection: 'row'` wrapper.

### Hover preview + pinned tap

For grid-of-cells screens (Tiers, eventually Tournaments brackets), the
right rail accepts both *hover* and *tap* drivers. Hover sets a
`hoverChart` state; tap sets a `pinned` state. The render uses
`displayChart = pinned ?? hover` so cursor movement gives a free
preview, and tap commits a pin you can dismiss with Esc.

`ChartCell` exposes an optional `onHover(hovered: boolean)` prop that's
only wired on desktop. Native ignores it.

### Inline toolbar replaces a settings sheet

When the mobile UI gates frequently-used controls behind a modal /
bottom-sheet of settings (Tiers density, show-unplayed, share), surface
those controls inline as a top toolbar on desktop. The settings sheet
stays on mobile — different ergonomics, same data layer.

### Centered modals instead of bottom sheets

`ChartScoresSheet` (Weekly Challenges) demonstrates the pattern: the
same `Modal` component switches between a bottom sheet and a centered
modal capped at 720 px, with the inner layout flipping from stacked to
2-col (jacket left, scrollable content right) on desktop. Animation
`slide` on mobile, `fade` on desktop.

### Horizontal scroll affordances

Awards rail in Weekly Challenges adds explicit chevron buttons + edge
fades + scroll-snap on desktop only. Touch surfaces don't need them;
mouse users do. Track scrollX/contentWidth/viewportWidth manually so
the chevrons disappear at the ends.

### URL-state for selected children

Songs uses `?chart=…`, Lists uses native `router.push`, Tiers uses
local state (no deep-link needed). When the child detail is a
first-class concept users link to, prefer `?param=…`; when it's purely
ephemeral (hover preview, transient pin), local state is fine.

### Persistent help / explainer rail

Training shows the pattern: the existing tap-to-explain `HelpSheet`
becomes a persistent right rail on desktop. The mobile sheet still
exists and stays gated on `!isDesktop` so both surfaces share the same
`TRAINING_HELP[key]` content map.

## What's out of scope

- New features. This pass is purely layout/responsive.
- Backend changes. If a desktop layout needs a new endpoint, file a
  follow-up issue rather than ship it inline.
- iOS / Android — they're already great today.

## Deploy

Mobile web build → `dist/`:

```
cd mobile/
EXPO_PUBLIC_API_URL='' npx expo export --platform web
rsync -a --delete dist/ root@159.65.91.103:/var/www/new-shinsa-web/
```

`EXPO_PUBLIC_API_URL=''` keeps API calls relative — the nginx
in front of `/var/www/new-shinsa-web/` proxies `/api/*` to the
backend, so a hardcoded URL would break that path.
