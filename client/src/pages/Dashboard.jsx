import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getTournaments, deleteTournament, searchTournaments, getNotices } from '../utils/api';

const PHASE_LABELS = {
  SETUP: 'Setup',
  ROUND_ROBIN: 'Round Robin',
  COMPLETED: 'Completed',
};

export default function Dashboard() {
  const [tournaments, setTournaments] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);

  useEffect(() => {
    getTournaments()
      .then(t => setTournaments(t))
      .catch(console.error)
      .finally(() => setLoading(false));
    getNotices()
      .then(n => setNotices(n))
      .catch(console.error);
  }, []);

  const handleSearch = useCallback(async (q) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchTournaments(q);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch(searchQuery);
      } else {
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleDelete = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    await deleteTournament(id);
    setTournaments(t => t.filter(x => x.id !== id));
    if (searchResults) setSearchResults(sr => sr.filter(x => x.id !== id));
  };

  const displayTournaments = searchResults !== null ? searchResults : tournaments;

  const TournamentCard = ({ t }) => (
    <Link
      key={t.id}
      to={`/tournament/${t.id}`}
      className="card-hover flex items-center justify-between group"
    >
      <div className="flex items-center gap-4">
        {t.avatar ? (
          <img
            src={t.avatar}
            alt={t.name}
            className="w-12 h-12 rounded-lg object-cover shadow-md"
          />
        ) : (
          <div className="w-12 h-12 bg-gradient-to-br from-piu-accent to-purple-700 rounded-lg flex items-center justify-center font-display text-xl font-bold shadow-md">
            {t.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h3 className="font-display text-lg font-bold group-hover:text-piu-accent transition-colors">
            {t.name}
          </h3>
          <div className="flex gap-3 text-sm text-gray-400">
            {t.location && <span>{t.location}</span>}
            {t.date && <span>{t.date}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`badge ${
          t.phase === 'SETUP' ? 'badge-pending' :
          t.phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
        }`}>
          {PHASE_LABELS[t.phase] || t.phase}
        </span>
        <button
          onClick={(e) => handleDelete(e, t.id)}
          className="text-gray-600 hover:text-red-500 transition-colors p-1"
          title="Delete tournament"
        >
          &#10005;
        </button>
      </div>
    </Link>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold tracking-wider">
          TOURNAMENTS
        </h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Round Robin</span>
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Gauntlets</span>
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Random Song Draws</span>
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Vetoes</span>
        </div>
      </div>

      {/* Notice Board */}
      {notices.length > 0 && (
        <div className="mb-6 space-y-2">
          {notices.map(n => (
            <button
              key={n.id}
              onClick={() => setSelectedNotice(n)}
              className="w-full text-left card-hover flex items-center gap-3 py-2.5 px-3 sm:px-4"
            >
              <span className={`text-xs font-display font-bold shrink-0 ${n.pinned ? 'text-piu-accent' : 'text-gray-500'}`}>
                {n.pinned ? 'PINNED' : 'NOTICE'}
              </span>
              <span className="font-display text-sm truncate flex-1">{n.title}</span>
              <span className="text-xs text-gray-600 shrink-0">{new Date(n.created_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            className="input-field w-full pl-10"
            placeholder="Search tournaments, locations, players..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">Searching...</span>
          )}
        </div>
        {searchResults !== null && (
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-500">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
            <button
              onClick={() => { setSearchQuery(''); setSearchResults(null); }}
              className="text-xs text-piu-accent hover:underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : displayTournaments.length === 0 ? (
        searchResults !== null ? (
          <div className="text-center py-10">
            <p className="text-gray-400">No tournaments found</p>
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-30 font-display">&#23529;&#26619;</div>
            <p className="text-gray-400 text-lg">No tournaments yet</p>
            <p className="text-gray-600 mt-2">Create your first tournament to get started</p>
            <Link to="/tournament/new" className="btn-primary mt-6 inline-block">
              Create Tournament
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="grid gap-4">
            {displayTournaments.map(t => <TournamentCard key={t.id} t={t} />)}
          </div>
          {searchResults === null && (
            <Link to="/tournament/new" className="btn-primary w-full mt-6 text-center text-lg block">
              + New Tournament
            </Link>
          )}
        </>
      )}

      {/* Notice Modal */}
      {selectedNotice && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedNotice(null)}
        >
          <div
            className="card max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                {selectedNotice.pinned && (
                  <span className="text-xs font-display font-bold text-piu-accent">PINNED</span>
                )}
                <h2 className="font-display font-bold text-xl">{selectedNotice.title}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(selectedNotice.created_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedNotice(null)}
                className="text-gray-500 hover:text-white transition-colors text-xl leading-none p-1"
              >
                &#10005;
              </button>
            </div>
            <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {selectedNotice.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
