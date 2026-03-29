import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMessageStoryArchivePaginated } from '../utils/api';
import { StoryViewerModal } from '../components/InboxHighlightsStrip';

const GRADIENT_FALLBACKS = {
  sunset: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  ocean: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  neon: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
  dark: 'linear-gradient(160deg, #0a101b 0%, #1a2136 100%)',
  fire: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
  mint: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  arcade: 'linear-gradient(160deg, #1a0533 0%, #4a0e8f 50%, #ff00ff 100%)',
  steel: 'linear-gradient(180deg, #2c3e50 0%, #4ca1af 100%)',
};
const DEFAULT_GRADIENT = 'linear-gradient(160deg, #0a101b 0%, #1a2136 100%)';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseStoryDate(entry) {
  const raw = entry?.original_created_at || entry?.story?.created_at || entry?.archived_at || '';
  if (!raw) return null;
  const d = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getStoryThumbnail(story) {
  if (story?.media_url) return { type: 'image', src: story.media_url };
  if (story?.snapshot?.jacket_url) return { type: 'image', src: story.snapshot.jacket_url };
  const gradient = story?.metadata_json?.gradient || story?.metadata_json?.theme?.background;
  if (gradient) return { type: 'gradient', css: gradient };
  const gradientId = story?.metadata_json?.gradientId || '';
  if (gradientId && GRADIENT_FALLBACKS[gradientId]) return { type: 'gradient', css: GRADIENT_FALLBACKS[gradientId] };
  return { type: 'gradient', css: DEFAULT_GRADIENT };
}

function StoryThumbnail({ story, className = '', aspectClass = 'aspect-[3/4]', rounded = 'rounded-sm' }) {
  const thumb = getStoryThumbnail(story);
  if (thumb.type === 'image') {
    return (
      <div className={`relative overflow-hidden ${rounded} ${aspectClass} ${className}`}>
        <img
          src={thumb.src}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${aspectClass} ${className} flex items-center justify-center`}
      style={{ background: thumb.css }}
    >
      {story?.caption ? (
        <p className="px-1.5 text-[8px] leading-tight text-white/80 line-clamp-3 text-center font-display font-bold">
          {story.caption.slice(0, 60)}
        </p>
      ) : (
        <span className="text-xs font-display font-black text-white/40">Aa</span>
      )}
    </div>
  );
}

function formatMonthDate(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// --- Grid View ---

function GridView({ entries, hasMore, loadingMore, sentinelRef }) {
  let lastDateStr = '';

  return (
    <div className="pb-20">
      {entries.map((entry, i) => {
        const d = parseStoryDate(entry);
        const dk = d ? dateKey(d) : '';
        const showDateHeader = dk && dk !== lastDateStr;
        if (dk) lastDateStr = dk;
        return (
          <React.Fragment key={entry.story?.id || i}>
            {showDateHeader && d ? (
              <div className="bg-piu-bg px-4 py-2.5">
                <p className="text-xs font-display font-bold uppercase tracking-wider text-gray-500">
                  {formatMonthDate(d)}{d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ''}
                </p>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
      {/* Re-render as grid with date headers interspersed */}
      {(() => {
        const groups = [];
        let currentGroup = { dateStr: '', date: null, items: [] };
        entries.forEach((entry) => {
          const d = parseStoryDate(entry);
          const dk = d ? dateKey(d) : '';
          if (dk !== currentGroup.dateStr) {
            if (currentGroup.items.length > 0) groups.push(currentGroup);
            currentGroup = { dateStr: dk, date: d, items: [] };
          }
          currentGroup.items.push(entry);
        });
        if (currentGroup.items.length > 0) groups.push(currentGroup);
        return groups;
      })().map((group, gi) => (
        <React.Fragment key={group.dateStr || gi}>
          {group.date ? (
            <div className="bg-piu-bg px-4 py-2.5">
              <p className="text-xs font-display font-bold uppercase tracking-wider text-gray-500">
                {formatMonthDate(group.date)}{group.date.getFullYear() !== new Date().getFullYear() ? `, ${group.date.getFullYear()}` : ''}
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-[2px]">
            {group.items.map((entry, i) => (
              <StoryGridCell key={entry.story?.id || `${gi}-${i}`} entry={entry} />
            ))}
          </div>
        </React.Fragment>
      ))}
      {loadingMore ? (
        <div className="flex justify-center py-6">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-cyan-400" />
        </div>
      ) : null}
      {hasMore ? <div ref={sentinelRef} className="h-1" /> : null}
      {!hasMore && entries.length > 0 ? (
        <p className="py-8 text-center text-xs text-gray-600">End of archive</p>
      ) : null}
    </div>
  );
}

function StoryGridCell({ entry }) {
  return (
    <div className="relative">
      <StoryThumbnail story={entry.story} className="w-full" />
    </div>
  );
}

// --- Calendar View ---

function CalendarView({ entries, expandedDay, onExpandDay, allLoaded, draining }) {
  const grouped = useMemo(() => {
    const map = {};
    entries.forEach((entry) => {
      const d = parseStoryDate(entry);
      if (!d) return;
      const dk = dateKey(d);
      if (!map[dk]) map[dk] = [];
      map[dk].push(entry);
    });
    return map;
  }, [entries]);

  const months = useMemo(() => {
    if (!allLoaded || entries.length === 0) return [];
    const now = new Date();
    let oldest = now;
    entries.forEach((entry) => {
      const d = parseStoryDate(entry);
      if (d && d < oldest) oldest = d;
    });
    const result = [];
    let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(oldest.getFullYear(), oldest.getMonth(), 1);
    while (cursor >= end) {
      result.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    }
    return result;
  }, [entries, allLoaded]);

  if (draining) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-cyan-400" />
        <p className="text-sm text-gray-500">Loading archive...</p>
      </div>
    );
  }

  if (!allLoaded || months.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm text-gray-500">No archived stories yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-20 pt-4">
      {months.map(({ year, month }) => {
        const mk = `${year}-${String(month + 1).padStart(2, '0')}`;
        const hasStories = Object.keys(grouped).some((dk) => dk.startsWith(mk));
        if (!hasStories && month !== new Date().getMonth()) return null;
        return (
          <CalendarMonth
            key={mk}
            year={year}
            month={month}
            grouped={grouped}
            expandedDay={expandedDay}
            onExpandDay={onExpandDay}
          />
        );
      })}
    </div>
  );
}

function CalendarMonth({ year, month, grouped, expandedDay, onExpandDay }) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const weeks = [];
  let week = new Array(7).fill(null);
  let dayNum = 1;

  for (let i = 0; i < startDow; i++) {
    week[i] = null;
  }
  for (let i = startDow; dayNum <= daysInMonth; i++) {
    if (i >= 7) {
      weeks.push(week);
      week = new Array(7).fill(null);
      i = 0;
    }
    week[i] = dayNum;
    dayNum++;
  }
  if (week.some((d) => d !== null)) weeks.push(week);

  const expandedRef = useRef(null);
  const prevExpandedDay = useRef(null);

  useEffect(() => {
    if (expandedDay && expandedRef.current && expandedDay !== prevExpandedDay.current) {
      expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevExpandedDay.current = expandedDay;
  }, [expandedDay]);

  return (
    <div>
      <h3 className="mb-3 text-center font-display text-base font-black text-white">
        {MONTHS[month]} {year}
      </h3>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <span key={d} className="text-center text-[10px] font-display font-bold uppercase tracking-wider text-gray-600">
            {d}
          </span>
        ))}
      </div>
      {weeks.map((wk, wi) => {
        const expandedInThisWeek = wk.some((dayNum) => {
          if (!dayNum) return false;
          const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          return expandedDay === dk && grouped[dk];
        });
        return (
          <React.Fragment key={wi}>
            <div className="grid grid-cols-7 gap-1">
              {wk.map((dayNum, di) => {
                if (dayNum === null) return <div key={di} />;
                const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayEntries = grouped[dk] || [];
                const isExpanded = expandedDay === dk;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={dayEntries.length === 0}
                    onClick={() => dayEntries.length > 0 && onExpandDay(isExpanded ? null : dk)}
                    className={`relative flex flex-col items-center justify-center py-1 ${
                      dayEntries.length > 0 ? 'cursor-pointer' : 'cursor-default'
                    } ${isExpanded ? 'ring-2 ring-cyan-400/50 rounded-lg' : ''}`}
                  >
                    {dayEntries.length > 0 ? (
                      <div className="relative">
                        <img
                          src={getStoryThumbnail(dayEntries[0].story).type === 'image' ? getStoryThumbnail(dayEntries[0].story).src : undefined}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover border-2 border-piu-border/50"
                          style={
                            getStoryThumbnail(dayEntries[0].story).type === 'gradient'
                              ? { background: getStoryThumbnail(dayEntries[0].story).css }
                              : undefined
                          }
                          loading="lazy"
                        />
                        {dayEntries.length > 1 ? (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-white">
                            {dayEntries.length}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <span className={`mt-0.5 text-[10px] tabular-nums ${dayEntries.length > 0 ? 'font-bold text-white' : 'text-gray-600'}`}>
                      {dayNum}
                    </span>
                  </button>
                );
              })}
            </div>
            {expandedInThisWeek && expandedDay && grouped[expandedDay] ? (
              <div ref={expandedRef} className="my-2 rounded-[1rem] border border-piu-border/50 bg-piu-card/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-display font-bold text-gray-400">
                    {(() => {
                      const parts = expandedDay.split('-');
                      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                      return formatMonthDate(d);
                    })()}
                  </p>
                  <button
                    type="button"
                    onClick={() => onExpandDay(null)}
                    className="text-xs text-gray-500 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 scrollbar-none">
                  {grouped[expandedDay].map((entry, ei) => (
                    <div key={entry.story?.id || ei} className="shrink-0 snap-start">
                      <StoryThumbnail
                        story={entry.story}
                        className="w-20 cursor-pointer hover:opacity-80 transition-opacity"
                        aspectClass="aspect-[3/4]"
                        rounded="rounded-lg"
                      />
                      {entry.story?.caption ? (
                        <p className="mt-1 w-20 truncate text-[10px] text-gray-400">{entry.story.caption}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// --- Main Page ---

export default function StoryArchivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('grid');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [calendarDraining, setCalendarDraining] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStories, setViewerStories] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const sentinelRef = useRef(null);
  const drainingRef = useRef(false);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMessageStoryArchivePaginated({ limit: 200 })
      .then((result) => {
        if (cancelled) return;
        const stories = result?.stories || [];
        setEntries(stories);
        const more = result?.hasMore ?? false;
        setHasMore(more);
        if (!more) setAllLoaded(true);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Load more (grid infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || entries.length === 0) return;
    setLoadingMore(true);
    const lastEntry = entries[entries.length - 1];
    const beforeDate = lastEntry?.original_created_at || lastEntry?.story?.created_at || '';
    const beforeId = lastEntry?.story?.id || '';
    try {
      const result = await getMessageStoryArchivePaginated({ beforeDate, beforeId, limit: 200 });
      const newStories = result?.stories || [];
      setEntries((prev) => [...prev, ...newStories]);
      const more = result?.hasMore ?? false;
      setHasMore(more);
      if (!more) setAllLoaded(true);
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, hasMore, entries]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '200px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Calendar drain: auto-paginate when switching to calendar
  useEffect(() => {
    if (activeView !== 'calendar' || allLoaded || loading || drainingRef.current) return;
    drainingRef.current = true;
    setCalendarDraining(true);

    const drain = async () => {
      let currentEntries = entries;
      let more = hasMore;
      while (more && currentEntries.length > 0) {
        const lastEntry = currentEntries[currentEntries.length - 1];
        const beforeDate = lastEntry?.original_created_at || lastEntry?.story?.created_at || '';
        const beforeId = lastEntry?.story?.id || '';
        try {
          const result = await getMessageStoryArchivePaginated({ beforeDate, beforeId, limit: 200 });
          const newStories = result?.stories || [];
          currentEntries = [...currentEntries, ...newStories];
          more = result?.hasMore ?? false;
        } catch {
          more = false;
        }
      }
      setEntries(currentEntries);
      setHasMore(false);
      setAllLoaded(true);
      setCalendarDraining(false);
      drainingRef.current = false;
    };
    drain();
  }, [activeView, allLoaded, loading, entries, hasMore]);

  // Open story viewer
  const openViewer = useCallback((storiesToView, startIndex = 0) => {
    setViewerStories(storiesToView);
    setViewerIndex(startIndex);
    setViewerOpen(true);
  }, []);

  // Grid cell click handler
  const handleGridClick = useCallback((entry, index) => {
    const storiesFromIndex = entries.slice(index).map((e) => e.story).filter(Boolean);
    openViewer(storiesFromIndex, 0);
  }, [entries, openViewer]);

  // Calendar day story click handler
  const handleCalendarStoryClick = useCallback((dayEntries, storyIndex) => {
    const stories = dayEntries.map((e) => e.story).filter(Boolean);
    openViewer(stories, storyIndex);
  }, [openViewer]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-piu-bg">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-piu-bg">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 border-b border-piu-border/40 bg-piu-bg/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-black text-white">Stories archive</h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/6 p-0.5">
            <button
              type="button"
              onClick={() => setActiveView('grid')}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                activeView === 'grid' ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
              aria-label="Grid view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20" className="h-4 w-4">
                <path d="M2 4a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm6 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V4zm6 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V4zM2 10a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm6 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zm6 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('calendar')}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                activeView === 'calendar' ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
              aria-label="Calendar view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="h-10 w-10 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <p className="text-sm text-gray-500">No archived stories yet.</p>
          <p className="text-xs text-gray-600">Stories you archive will appear here.</p>
        </div>
      ) : activeView === 'grid' ? (
        <GridViewWithClick entries={entries} hasMore={hasMore} loadingMore={loadingMore} sentinelRef={sentinelRef} onStoryClick={handleGridClick} />
      ) : (
        <CalendarViewWithClick
          entries={entries}
          expandedDay={expandedDay}
          onExpandDay={setExpandedDay}
          allLoaded={allLoaded}
          draining={calendarDraining}
          onStoryClick={handleCalendarStoryClick}
        />
      )}

      {/* Story Viewer */}
      <StoryViewerModal
        open={viewerOpen}
        user={user}
        stories={viewerStories}
        onClose={() => setViewerOpen(false)}
        archiveMode
        initialIndex={viewerIndex}
      />
    </div>
  );
}

// Wrapper to pass click handlers through to grid cells
function GridViewWithClick({ entries, hasMore, loadingMore, sentinelRef, onStoryClick }) {
  let lastDateStr = '';

  const groups = useMemo(() => {
    const result = [];
    let currentGroup = { dateStr: '', date: null, items: [], startIndex: 0 };
    entries.forEach((entry, i) => {
      const d = parseStoryDate(entry);
      const dk = d ? dateKey(d) : '';
      if (dk !== currentGroup.dateStr) {
        if (currentGroup.items.length > 0) result.push(currentGroup);
        currentGroup = { dateStr: dk, date: d, items: [], startIndex: i };
      }
      currentGroup.items.push({ entry, globalIndex: i });
    });
    if (currentGroup.items.length > 0) result.push(currentGroup);
    return result;
  }, [entries]);

  return (
    <div className="pb-20">
      {groups.map((group, gi) => (
        <React.Fragment key={group.dateStr || gi}>
          {group.date ? (
            <div className="bg-piu-bg px-4 py-2.5">
              <p className="text-xs font-display font-bold uppercase tracking-wider text-gray-500">
                {formatMonthDate(group.date)}{group.date.getFullYear() !== new Date().getFullYear() ? `, ${group.date.getFullYear()}` : ''}
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-[2px]">
            {group.items.map(({ entry, globalIndex }) => (
              <button
                key={entry.story?.id || globalIndex}
                type="button"
                className="relative text-left"
                onClick={() => onStoryClick(entry, globalIndex)}
              >
                <StoryThumbnail story={entry.story} className="w-full" />
              </button>
            ))}
          </div>
        </React.Fragment>
      ))}
      {loadingMore ? (
        <div className="flex justify-center py-6">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-cyan-400" />
        </div>
      ) : null}
      {hasMore ? <div ref={sentinelRef} className="h-1" /> : null}
      {!hasMore && entries.length > 0 ? (
        <p className="py-8 text-center text-xs text-gray-600">End of archive</p>
      ) : null}
    </div>
  );
}

function CalendarViewWithClick({ entries, expandedDay, onExpandDay, allLoaded, draining, onStoryClick }) {
  const grouped = useMemo(() => {
    const map = {};
    entries.forEach((entry) => {
      const d = parseStoryDate(entry);
      if (!d) return;
      const dk = dateKey(d);
      if (!map[dk]) map[dk] = [];
      map[dk].push(entry);
    });
    return map;
  }, [entries]);

  const months = useMemo(() => {
    if (!allLoaded || entries.length === 0) return [];
    const now = new Date();
    let oldest = now;
    entries.forEach((entry) => {
      const d = parseStoryDate(entry);
      if (d && d < oldest) oldest = d;
    });
    const result = [];
    let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(oldest.getFullYear(), oldest.getMonth(), 1);
    while (cursor >= end) {
      result.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    }
    return result;
  }, [entries, allLoaded]);

  if (draining) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-cyan-400" />
        <p className="text-sm text-gray-500">Loading archive...</p>
      </div>
    );
  }

  if (!allLoaded || months.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm text-gray-500">No archived stories yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-20 pt-4">
      {months.map(({ year, month }) => {
        const mk = `${year}-${String(month + 1).padStart(2, '0')}`;
        const hasStories = Object.keys(grouped).some((dk) => dk.startsWith(mk));
        if (!hasStories) return null;
        return (
          <CalendarMonthWithClick
            key={mk}
            year={year}
            month={month}
            grouped={grouped}
            expandedDay={expandedDay}
            onExpandDay={onExpandDay}
            onStoryClick={onStoryClick}
          />
        );
      })}
    </div>
  );
}

function CalendarMonthWithClick({ year, month, grouped, expandedDay, onExpandDay, onStoryClick }) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const weeks = [];
  let week = new Array(7).fill(null);
  let dayNum = 1;
  let col = startDow;

  while (dayNum <= daysInMonth) {
    week[col] = dayNum;
    col++;
    dayNum++;
    if (col >= 7) {
      weeks.push(week);
      week = new Array(7).fill(null);
      col = 0;
    }
  }
  if (week.some((d) => d !== null)) weeks.push(week);

  const expandedRef = useRef(null);
  const prevExpandedDay = useRef(null);

  useEffect(() => {
    if (expandedDay && expandedRef.current && expandedDay !== prevExpandedDay.current) {
      expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevExpandedDay.current = expandedDay;
  }, [expandedDay]);

  return (
    <div>
      <h3 className="mb-3 text-center font-display text-base font-black text-white">
        {MONTHS[month]} {year}
      </h3>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <span key={d} className="text-center text-[10px] font-display font-bold uppercase tracking-wider text-gray-600">
            {d}
          </span>
        ))}
      </div>
      {weeks.map((wk, wi) => {
        const expandedInThisWeek = wk.some((dn) => {
          if (!dn) return false;
          const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(dn).padStart(2, '0')}`;
          return expandedDay === dk && grouped[dk];
        });
        return (
          <React.Fragment key={wi}>
            <div className="grid grid-cols-7 gap-1 py-0.5">
              {wk.map((dn, di) => {
                if (dn === null) return <div key={di} />;
                const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(dn).padStart(2, '0')}`;
                const dayEntries = grouped[dk] || [];
                const isExpanded = expandedDay === dk;
                const thumb = dayEntries.length > 0 ? getStoryThumbnail(dayEntries[0].story) : null;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={dayEntries.length === 0}
                    onClick={() => dayEntries.length > 0 && onExpandDay(isExpanded ? null : dk)}
                    className={`relative flex flex-col items-center justify-center py-0.5 ${
                      dayEntries.length > 0 ? 'cursor-pointer' : 'cursor-default'
                    } ${isExpanded ? 'ring-2 ring-cyan-400/50 rounded-lg' : ''}`}
                  >
                    {dayEntries.length > 0 && thumb ? (
                      <div className="relative">
                        {thumb.type === 'image' ? (
                          <img
                            src={thumb.src}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover border-2 border-piu-border/50"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="h-10 w-10 rounded-full border-2 border-piu-border/50"
                            style={{ background: thumb.css }}
                          />
                        )}
                        {dayEntries.length > 1 ? (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-white">
                            {dayEntries.length}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <span className={`mt-0.5 text-[10px] tabular-nums ${dayEntries.length > 0 ? 'font-bold text-white' : 'text-gray-600'}`}>
                      {dn}
                    </span>
                  </button>
                );
              })}
            </div>
            {expandedInThisWeek && expandedDay && grouped[expandedDay] ? (
              <div ref={expandedRef} className="my-2 rounded-[1rem] border border-piu-border/50 bg-piu-card/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-display font-bold text-gray-400">
                    {(() => {
                      const parts = expandedDay.split('-');
                      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                      return formatMonthDate(d);
                    })()}
                  </p>
                  <button
                    type="button"
                    onClick={() => onExpandDay(null)}
                    className="text-xs text-gray-500 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 scrollbar-none">
                  {grouped[expandedDay].map((entry, ei) => (
                    <button
                      key={entry.story?.id || ei}
                      type="button"
                      className="shrink-0 snap-start text-left"
                      onClick={() => onStoryClick(grouped[expandedDay], ei)}
                    >
                      <StoryThumbnail
                        story={entry.story}
                        className="w-20 hover:opacity-80 transition-opacity"
                        aspectClass="aspect-[3/4]"
                        rounded="rounded-lg"
                      />
                      {entry.story?.caption ? (
                        <p className="mt-1 w-20 truncate text-[10px] text-gray-400">{entry.story.caption}</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
