import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSongLibrary } from '../utils/api';

function ChartBadge({ chart }) {
  const isSingle = chart.mode === 'Single';
  const baseColor = isSingle
    ? 'from-red-500 to-red-700 border-red-300/50'
    : 'from-green-500 to-emerald-700 border-green-300/50';

  return (
    <Link
      to={`/songs/chart/${chart.chart_id}`}
      className={`inline-flex items-center justify-center min-w-[42px] h-[42px] text-sm rounded-full border bg-gradient-to-b ${baseColor} text-white font-display font-black shadow-md hover:brightness-110 transition-all`}
      title={`${isSingle ? 'S' : 'D'}${chart.level}`}
    >
      {chart.level}
    </Link>
  );
}

export default function SongsPage() {
  const { user } = useAuth();

  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const libraryData = await getSongLibrary(user?.id ? { user_id: user.id } : {});
        if (cancelled) return;
        setLibrary(Array.isArray(libraryData?.songs) ? libraryData.songs : []);
      } catch (err) {
        if (cancelled) return;
        setLibrary([]);
        setError(err.message || 'Failed to load songs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const filteredSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;

    return library
      .map((song) => {
        const songMatches = `${song.title} ${song.artist}`.toLowerCase().includes(q);
        const charts = (song.charts || []).filter((chart) => {
          if (songMatches) return true;
          const chartText = `${chart.mode} ${chart.level}`.toLowerCase();
          return chartText.includes(q);
        });
        if (!songMatches && charts.length === 0) return null;
        return { ...song, charts };
      })
      .filter(Boolean);
  }, [library, search]);

  const songSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const ranked = [];
    for (const song of library) {
      const title = String(song.title || '');
      const artist = String(song.artist || '');
      const titleLower = title.toLowerCase();
      const artistLower = artist.toLowerCase();
      if (!titleLower.includes(q) && !artistLower.includes(q)) continue;

      const startsWithTitle = titleLower.startsWith(q);
      const startsWithArtist = artistLower.startsWith(q);
      ranked.push({
        song_group_key: song.song_group_key,
        title,
        artist,
        priority: startsWithTitle ? 0 : startsWithArtist ? 1 : 2,
      });
    }

    ranked.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    return ranked.slice(0, 8);
  }, [library, search]);

  useEffect(() => {
    function handleDocClick(event) {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-10 text-center text-gray-500">Loading songs...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">SONGS</h1>
          <p className="text-xs text-gray-500">Phoenix chart database with singles and doubles</p>
        </div>
        <Link
          to="/head-to-head"
          className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-700 border border-amber-200/30 text-white font-display font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-900/30 hover:brightness-110 transition-all whitespace-nowrap"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 10V8a2 2 0 012-2h4a3 3 0 013 3v9H9a4 4 0 01-4-4v-3a1 1 0 011-1h1Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h2V7a1 1 0 10-2 0v3Zm3 0h2V7a1 1 0 10-2 0v3Z" />
          </svg>
          Head to Head
        </Link>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div ref={searchWrapRef} className="relative flex-1 min-w-[220px]">
            <input
              value={search}
              onFocus={() => setShowSuggestions(true)}
              onChange={(event) => {
                setSearch(event.target.value);
                setShowSuggestions(true);
              }}
              placeholder="Search songs"
              className="input-field w-full"
            />
            {showSuggestions && songSuggestions.length > 0 && (
              <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden">
                {songSuggestions.map((item) => (
                  <button
                    key={item.song_group_key}
                    type="button"
                    onClick={() => {
                      setSearch(item.title);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-piu-dark/70 transition-colors border-b border-piu-border/20 last:border-0"
                  >
                    <p className="text-sm font-display font-bold truncate">{item.title}</p>
                    <p className="text-[11px] text-gray-500 truncate">{item.artist || 'Unknown artist'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {filteredSongs.map((song) => (
            <div key={song.song_group_key} className="rounded-xl border border-piu-border/50 bg-gradient-to-r from-[#112947] to-[#1b3554] p-3">
              <div className="flex gap-3">
                {song.jacket_url ? (
                  <img src={song.jacket_url} alt={song.title} className="w-24 h-14 sm:w-28 sm:h-16 rounded object-cover border border-piu-border/40" />
                ) : (
                  <div className="w-24 h-14 sm:w-28 sm:h-16 rounded bg-piu-dark border border-piu-border/40 flex items-center justify-center text-xs text-gray-500">
                    No image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-display font-bold leading-tight truncate">{song.title}</p>
                  <p className="text-xs text-gray-400 truncate">{song.artist || 'Unknown artist'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {song.charts.map((chart) => (
                  <div key={`${song.song_group_key}-${chart.key}`} className="relative">
                    <ChartBadge chart={chart} />
                    {chart.is_pass && (
                      <span className="absolute -bottom-1 -right-1 text-[9px] px-1 rounded-full bg-piu-dark border border-piu-border text-piu-accent font-mono">
                        {chart.mode === 'Single' ? 'S' : 'D'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredSongs.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-6">No songs found</p>
          )}
        </div>
      </section>
    </div>
  );
}
