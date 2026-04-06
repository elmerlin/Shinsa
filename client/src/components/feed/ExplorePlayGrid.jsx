import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getExploreFeed } from '../../utils/api';
import { resolveChartJacketUrl } from '../PiuChartJacket';
import { buildReplayModalTitle } from '../../utils/replayTitle';
import ExplorePlayTile from './ExplorePlayTile';
import ExploreFeedToolbar from './ExploreFeedToolbar';

function resolveTileJacketUrl(play, jacketLookup) {
  return resolveChartJacketUrl({
    title: play.song_title,
    mode: play.mode,
    level: play.level,
    jacketLookup,
    backgroundUrl: play.background_url,
    jacketUrl: play.jacket_url,
  });
}

function resolveTileChartPath(play, chartKeyMap) {
  const directPath = String(play.chart_path || '').trim();
  if (directPath) return directPath;
  const norm = (play.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!norm) return '/songs';
  const exactKey = `${norm}|${play.mode || ''}|${play.level || ''}`;
  const chartId = chartKeyMap?.[exactKey] || chartKeyMap?.[norm];
  return chartId ? `/songs/chart/${chartId}` : `/songs?q=${encodeURIComponent(play.song_title || '')}`;
}

/**
 * Space hero tiles evenly through the array so they don't cluster.
 * Also assign alternating feature variants (wide/tall).
 */
function layoutItems(items) {
  const heroes = [];
  const rest = [];
  for (const item of items) {
    if (item.highlight_tier === 'hero') heroes.push(item);
    else rest.push(item);
  }
  if (heroes.length === 0) return items;

  const result = [];
  const spacing = Math.max(5, Math.floor(rest.length / Math.max(heroes.length, 1)));
  let heroIdx = 0;

  for (let i = 0; i < rest.length; i++) {
    if (heroIdx < heroes.length && i > 0 && i % spacing === 0) {
      result.push(heroes[heroIdx++]);
    }
    result.push(rest[i]);
  }
  while (heroIdx < heroes.length) {
    result.splice(Math.min(1, result.length), 0, heroes[heroIdx++]);
  }
  return result;
}

export default function ExplorePlayGrid({ jacketLookup, chartKeyMap, onScoreClick, onReplayClick }) {
  const [scope, setScope] = useState('following');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(false);
  const sentinelRef = useRef(null);
  const activeRef = useRef(true);

  // reset on scope change
  const handleScopeChange = (newScope) => {
    if (newScope === scope) return;
    setScope(newScope);
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);
    setError(false);
  };

  // initial fetch
  useEffect(() => {
    let active = true;
    activeRef.current = true;
    setInitialLoading(true);
    setError(false);

    getExploreFeed({ scope })
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
        setCursor(data.nextCursor || null);
        setHasMore(!!data.hasMore);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });

    return () => {
      active = false;
      activeRef.current = false;
    };
  }, [scope]);

  // load more
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !cursor) return;
    setLoading(true);
    try {
      const data = await getExploreFeed({ scope, cursor });
      if (!activeRef.current) return;
      setItems((prev) => [...prev, ...(data.items || [])]);
      setCursor(data.nextCursor || null);
      setHasMore(!!data.hasMore);
    } catch {}
    if (activeRef.current) setLoading(false);
  }, [scope, cursor, loading, hasMore]);

  // infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleTileClick = (play) => {
    const jacketUrl = resolveTileJacketUrl(play, jacketLookup);
    const chartLink = resolveTileChartPath(play, chartKeyMap);
    onScoreClick({
      ...play,
      _jacketUrl: jacketUrl,
      _chartLink: chartLink,
      play_id: play.play_id,
    });
  };

  const laid = layoutItems(items);
  let featureCounter = 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <ExploreFeedToolbar scope={scope} onScopeChange={handleScopeChange} />
        <span className="text-[10px] font-mono text-zinc-600 tracking-wide">Last 7 days</span>
      </div>

      {initialLoading ? (
        <div className="explore-grid mt-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-xl bg-white/[0.03] border border-white/[0.04] animate-pulse ${
                i === 0 ? 'col-span-2 row-span-2' : ''
              }`}
            />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-3">Couldn't load explore feed</p>
          <button
            type="button"
            onClick={() => {
              setError(false);
              setInitialLoading(true);
              getExploreFeed({ scope })
                .then((data) => {
                  setItems(data.items || []);
                  setCursor(data.nextCursor || null);
                  setHasMore(!!data.hasMore);
                })
                .catch(() => setError(true))
                .finally(() => setInitialLoading(false));
            }}
            className="text-piu-accent text-sm font-display font-bold hover:text-white transition-colors"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">Nothing to explore yet</p>
          <p className="text-gray-500 text-sm">
            {scope === 'following'
              ? 'Follow more players or switch to Global to discover plays.'
              : 'No plays recorded in the last 7 days.'}
          </p>
        </div>
      ) : (
        <>
          <div className="explore-grid">
            {laid.map((play, i) => {
              let featureVariant = undefined;
              if (play.highlight_tier === 'feature') {
                featureVariant = featureCounter % 2 === 0 ? 'wide' : 'tall';
                featureCounter++;
              }
              return (
                <ExplorePlayTile
                  key={`${play.play_id}-${i}`}
                  play={play}
                  jacketUrl={resolveTileJacketUrl(play, jacketLookup)}
                  onClick={() => handleTileClick(play)}
                  onReplayClick={onReplayClick}
                  staggerIndex={i}
                  featureVariant={featureVariant}
                />
              );
            })}
          </div>

          <div ref={sentinelRef} className="h-4" />

          {loading && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 text-zinc-500 text-xs font-display">
                <div className="h-3 w-3 rounded-full border-2 border-zinc-600 border-t-piu-accent animate-spin" />
                Loading more
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
