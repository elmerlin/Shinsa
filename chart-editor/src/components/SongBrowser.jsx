import { useState, useEffect, useCallback, useRef } from 'react';
import { parseSSC } from '../lib/sscParser.js';

const BASE = import.meta.env.BASE_URL || '/charting/';

/**
 * Song browser for preset simfiles.
 * Shows packs with horizontal song carousels, chart selection by type/difficulty.
 */
export default function SongBrowser({ onSelectChart, onLoadSM, onLoadAudio }) {
  const [manifest, setManifest] = useState(null);
  const [selectedSong, setSelectedSong] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const smInputRef = useRef(null);
  const audioInputRef = useRef(null);

  // Fetch manifest on mount
  useEffect(() => {
    fetch(`${BASE}presets/manifest.json`)
      .then(r => r.json())
      .then(setManifest)
      .catch(err => setError('Failed to load song list: ' + err.message));
  }, []);

  // Load a specific chart from a song
  const handleSelectChart = useCallback(async (song, chart) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}presets/${song.file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = parseSSC(text);
      // Find matching chart index by type + meter
      let chartIndex = data.charts.findIndex(c =>
        c.type === chart.type && parseInt(c.meter) === chart.meter
      );
      if (chartIndex < 0) chartIndex = 0;
      // Also fetch audio if available
      let audioBuffer = null;
      if (song.music) {
        try {
          const audioRes = await fetch(`${BASE}presets/${song.music}`);
          if (audioRes.ok) audioBuffer = await audioRes.arrayBuffer();
        } catch { /* audio optional */ }
      }
      onSelectChart(data, chartIndex, audioBuffer);
    } catch (err) {
      setError(`Failed to load ${song.title}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [onSelectChart]);

  // File input handlers
  const handleSMInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => onLoadSM(reader.result, file.name);
      reader.readAsText(file);
    }
  }, [onLoadSM]);

  const handleAudioInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => onLoadAudio(reader.result, file.name);
      reader.readAsArrayBuffer(file);
    }
  }, [onLoadAudio]);

  // Filter songs by search
  const filteredPacks = manifest?.packs?.map(pack => {
    if (!search.trim()) return pack;
    const q = search.toLowerCase();
    const filteredSongs = pack.songs.filter(s =>
      s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
    return { ...pack, songs: filteredSongs };
  }).filter(p => p.songs.length > 0);

  return (
    <div className="h-full flex flex-col bg-piu-bg text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-piu-dark border-b border-piu-border shrink-0">
        <h1 className="text-xl font-display font-bold tracking-wide">
          <span className="text-piu-accent">SHINSA</span> Chart Editor
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => smInputRef.current?.click()}
            className="px-3 py-1.5 rounded text-sm bg-piu-card border border-piu-border text-gray-300 hover:text-white font-display"
          >
            Open .sm/.ssc
          </button>
          <button
            onClick={() => onLoadSM(null)}
            className="px-3 py-1.5 rounded text-sm bg-piu-card border border-piu-border text-gray-300 hover:text-white font-display"
          >
            New Chart
          </button>
          <input ref={smInputRef} type="file" accept=".sm,.ssc" onChange={handleSMInput} className="hidden" />
          <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioInput} className="hidden" />
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 shrink-0">
        <input
          type="text"
          placeholder="Search songs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md bg-piu-card border border-piu-border rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-piu-accent"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-2 text-piu-accent text-sm">{error}</div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="text-white font-display text-lg">Loading chart...</div>
        </div>
      )}

      {/* Song list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {!manifest && !error && (
          <div className="text-gray-500 text-center py-12">Loading songs...</div>
        )}

        {filteredPacks?.map(pack => (
          <div key={pack.name} className="mb-8">
            <h2 className="text-lg font-display font-bold text-piu-gold mb-3 tracking-wide">
              {pack.name}
              <span className="text-xs text-gray-500 font-normal ml-2">{pack.songs.length} songs</span>
            </h2>

            {/* Song carousel */}
            <SongCarousel
              songs={pack.songs}
              selectedSong={selectedSong}
              onSelectSong={setSelectedSong}
            />

            {/* Chart selection for selected song in this pack */}
            {selectedSong && pack.songs.includes(selectedSong) && (
              <ChartPicker
                song={selectedSong}
                onSelectChart={handleSelectChart}
              />
            )}
          </div>
        ))}

        {filteredPacks?.length === 0 && search && (
          <div className="text-gray-500 text-center py-12">No songs match "{search}"</div>
        )}
      </div>
    </div>
  );
}

/**
 * Horizontal scrollable carousel of song cards
 */
function SongCarousel({ songs, selectedSong, onSelectSong }) {
  const scrollRef = useRef(null);

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 400, behavior: 'smooth' });
  };

  return (
    <div className="relative group">
      {/* Left arrow */}
      <button
        onClick={() => scroll(-1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-piu-dark/90 border border-piu-border text-gray-400 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ◀
      </button>

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {songs.map((song, i) => {
          const isSelected = selectedSong === song;
          const singles = song.charts.filter(c => c.type === 'pump-single').length;
          const doubles = song.charts.filter(c => c.type === 'pump-double').length;

          return (
            <div
              key={i}
              onClick={() => onSelectSong(isSelected ? null : song)}
              className={`shrink-0 w-36 rounded-lg overflow-hidden cursor-pointer transition-all border
                ${isSelected
                  ? 'border-piu-accent ring-1 ring-piu-accent'
                  : 'border-piu-border hover:border-gray-500'
                }`}
              style={{ scrollSnapAlign: 'start' }}
            >
              {/* Jacket */}
              <SongJacket jacket={song.jacket} title={song.title} />
              {/* Info */}
              <div className="p-2 bg-piu-card">
                <div className="text-xs font-display font-semibold truncate" title={song.title}>
                  {song.title}
                </div>
                <div className="text-[10px] text-gray-500 truncate" title={song.artist}>
                  {song.artist}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                  {singles > 0 && <span className="text-piu-accent">S{singles}</span>}
                  {doubles > 0 && <span className="text-piu-green">D{doubles}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll(1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-piu-dark/90 border border-piu-border text-gray-400 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ▶
      </button>
    </div>
  );
}

/**
 * Chart picker showing Singles (red) and Doubles (green) buttons
 */
function ChartPicker({ song, onSelectChart }) {
  const singles = song.charts.filter(c => c.type === 'pump-single');
  const doubles = song.charts.filter(c => c.type === 'pump-double');
  const halfDoubles = song.charts.filter(c => c.type === 'pump-halfdouble');

  return (
    <div className="mt-3 p-4 rounded-lg bg-piu-dark border border-piu-border">
      <div className="text-sm font-display font-bold mb-1">
        {song.title}
        <span className="text-gray-500 font-normal ml-2">by {song.artist}</span>
      </div>

      <div className="flex flex-wrap gap-4 mt-3">
        {/* Singles */}
        {singles.length > 0 && (
          <div>
            <div className="text-xs text-piu-accent font-semibold mb-1.5">Singles</div>
            <div className="flex gap-1.5 flex-wrap">
              {singles.map((c, i) => (
                <button
                  key={i}
                  onClick={() => onSelectChart(song, c)}
                  className="px-3 py-1.5 rounded text-xs font-display font-bold bg-piu-accent/20 border border-piu-accent text-piu-accent hover:bg-piu-accent hover:text-white transition-colors"
                  title={`${c.difficulty} ${c.meter}`}
                >
                  S{c.meter}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Doubles */}
        {doubles.length > 0 && (
          <div>
            <div className="text-xs text-piu-green font-semibold mb-1.5">Doubles</div>
            <div className="flex gap-1.5 flex-wrap">
              {doubles.map((c, i) => (
                <button
                  key={i}
                  onClick={() => onSelectChart(song, c)}
                  className="px-3 py-1.5 rounded text-xs font-display font-bold bg-piu-green/20 border border-piu-green text-piu-green hover:bg-piu-green hover:text-black transition-colors"
                  title={`${c.difficulty} ${c.meter}`}
                >
                  D{c.meter}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Half-doubles */}
        {halfDoubles.length > 0 && (
          <div>
            <div className="text-xs text-piu-gold font-semibold mb-1.5">Half-Double</div>
            <div className="flex gap-1.5 flex-wrap">
              {halfDoubles.map((c, i) => (
                <button
                  key={i}
                  onClick={() => onSelectChart(song, c)}
                  className="px-3 py-1.5 rounded text-xs font-display font-bold bg-piu-gold/20 border border-piu-gold text-piu-gold hover:bg-piu-gold hover:text-black transition-colors"
                  title={`${c.difficulty} ${c.meter}`}
                >
                  HD{c.meter}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Song jacket image with fallback to first letter
 */
function SongJacket({ jacket, title }) {
  const [failed, setFailed] = useState(false);
  const showImg = jacket && !failed;

  return (
    <div className="w-full aspect-square bg-piu-dark relative overflow-hidden">
      {showImg && (
        <img
          src={jacket}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {!showImg && (
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-display font-bold text-gray-600">
          {title[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}
