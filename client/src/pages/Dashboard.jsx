import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getTournaments, getDuels, getNotices, deleteTournament, searchTournaments, deleteDuel, getOnlineDuels, deleteOnlineDuel } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';

const PHASE_LABELS = {
  SETUP: 'Setup',
  ROUND_ROBIN: 'Round Robin',
  COMPLETED: 'Completed',
};

export default function Dashboard() {
  const [tournaments, setTournaments] = useState([]);
  const [duels, setDuels] = useState([]);
  const [onlineDuels, setOnlineDuels] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);

  useEffect(() => {
    // Fire all requests independently — page renders immediately,
    // each section fills in as its data arrives
    getTournaments().then(setTournaments).catch(() => {});
    getDuels().then(setDuels).catch(() => {});
    getOnlineDuels().then(setOnlineDuels).catch(() => {});
    getNotices().then(setNotices).catch(() => {});
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

  const handleDeleteDuel = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this duel? This cannot be undone.')) return;
    await deleteDuel(id);
    setDuels(d => d.filter(x => x.id !== id));
  };

  const handleDeleteOnlineDuel = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this online duel? This cannot be undone.')) return;
    try {
      await deleteOnlineDuel(id);
      setOnlineDuels(d => d.filter(x => x.id !== id));
    } catch (err) {
      alert(err.message);
    }
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
            src={getAvatarUrl(t.avatar)}
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

  const DuelCard = ({ d }) => (
    <Link
      key={d.id}
      to={`/duel/${d.id}`}
      className="card-hover flex items-center justify-between group"
    >
      <div className="flex items-center gap-3">
        {/* Duel avatar: two player avatars with crossed swords */}
        <div className="flex items-center shrink-0">
          <div className="w-9 h-9 rounded-full overflow-hidden border border-red-500/40 -mr-2 z-10">
            {d.player1_avatar ? (
              <img src={getAvatarUrl(d.player1_avatar)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-xs">
                {d.player1_name[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="w-5 h-5 bg-piu-card rounded-full flex items-center justify-center z-20 -mx-0.5">
            <svg width="12" height="12" viewBox="0 0 40 40" fill="none" className="text-piu-accent">
              <path d="M8 8L32 32M8 8L12 4M8 8L4 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M32 8L8 32M32 8L28 4M32 8L36 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="w-9 h-9 rounded-full overflow-hidden border border-blue-500/40 -ml-2">
            {d.player2_avatar ? (
              <img src={getAvatarUrl(d.player2_avatar)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-xs">
                {d.player2_name[0].toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="font-display text-base font-bold group-hover:text-piu-accent transition-colors">
            {d.name}
          </h3>
          <div className="flex gap-2 text-xs text-gray-500">
            <span>
              {d.player1_nationality && <>{getCountryFlag(d.player1_nationality)} </>}
              {d.player1_name} vs{' '}
              {d.player2_nationality && <>{getCountryFlag(d.player2_nationality)} </>}
              {d.player2_name}
            </span>
            {d.location && <span>- {d.location}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`badge ${d.status === 'COMPLETED' ? 'badge-completed' : 'badge-active'}`}>
          {d.status === 'COMPLETED' ? 'Completed' : 'Active'}
        </span>
        <button
          onClick={(e) => handleDeleteDuel(e, d.id)}
          className="text-gray-600 hover:text-red-500 transition-colors p-1"
          title="Delete duel"
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
          PUMP DOJO
        </h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Round Robin</span>
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Gauntlets</span>
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Offline Duels</span>
          <span className="text-xs font-display tracking-wider text-gray-400 bg-gray-800/60 px-2 py-1 rounded">Online Duels</span>
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
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
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

      {/* Online Duels Section */}
      {onlineDuels.length > 0 && searchResults === null && (
        <div className="mb-8">
          <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent mb-3">ONLINE DUELS</h2>
          <div className="grid gap-3">
            {onlineDuels.map(d => (
              <Link
                key={d.id}
                to={`/online-duel/${d.id}`}
                className="card-hover flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center shrink-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-red-500/40 -mr-2 z-10">
                      {d.creator_avatar ? (
                        <img src={getAvatarUrl(d.creator_avatar)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-xs">
                          {(d.creator_username || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="w-5 h-5 bg-piu-card rounded-full flex items-center justify-center z-20 -mx-0.5">
                      <span className="text-piu-accent text-xs">&#9876;</span>
                    </div>
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-blue-500/40 -ml-2">
                      {d.opponent_avatar ? (
                        <img src={getAvatarUrl(d.opponent_avatar)} alt="" className="w-full h-full object-cover" />
                      ) : d.opponent_username ? (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-xs">
                          {d.opponent_username[0].toUpperCase()}
                        </div>
                      ) : (
                        <div className="w-full h-full bg-gray-700 flex items-center justify-center font-display font-bold text-xs text-gray-400">
                          ?
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold group-hover:text-piu-accent transition-colors">
                      {d.name}
                    </h3>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>{d.creator_username} vs {d.opponent_username || 'Waiting...'}</span>
                      {d.location && <span>- {d.location}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${
                    d.status === 'COMPLETED' ? 'badge-completed' :
                    d.status === 'WAITING' ? 'badge-pending' : 'badge-active'
                  }`}>
                    {d.status === 'COMPLETED' ? 'Completed' : d.status === 'WAITING' ? 'Waiting' : 'Active'}
                  </span>
                  <button
                    onClick={(e) => handleDeleteOnlineDuel(e, d.id)}
                    className="text-gray-600 hover:text-red-500 transition-colors p-1"
                    title="Delete online duel"
                  >
                    &#10005;
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Offline Duels Section */}
      {duels.length > 0 && searchResults === null && (
        <div className="mb-8">
          <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent mb-3">OFFLINE DUELS</h2>
          <div className="grid gap-3">
            {duels.map(d => <DuelCard key={d.id} d={d} />)}
          </div>
          <Link to="/duel/new" className="btn-secondary w-full mt-3 text-center block text-sm">
            + New Duel
          </Link>
        </div>
      )}

      {/* Tournaments Section */}
      <div>
        <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent mb-3">TOURNAMENTS</h2>
        {displayTournaments.length === 0 ? (
          searchResults !== null ? (
            <div className="text-center py-10">
              <p className="text-gray-400">No tournaments found</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400">No tournaments yet</p>
              <p className="text-gray-600 mt-1 text-sm">Create your first tournament to get started</p>
            </div>
          )
        ) : (
          <div className="grid gap-4">
            {displayTournaments.map(t => <TournamentCard key={t.id} t={t} />)}
          </div>
        )}
      </div>

      {/* Create buttons */}
      {searchResults === null && (
        <div className="grid grid-cols-3 gap-3 mt-6">
          <Link to="/tournament/new" className="btn-primary text-center text-sm block">
            + Tournament
          </Link>
          <Link to="/duel/new" className="btn-primary bg-gradient-to-r from-red-600 to-blue-600 hover:from-red-500 hover:to-blue-500 text-center text-sm block">
            + Offline Duel
          </Link>
          <Link to="/online-duel/new" className="btn-primary bg-gradient-to-r from-piu-accent to-piu-gold hover:from-piu-accent/80 hover:to-piu-gold/80 text-center text-sm block">
            + Online Duel
          </Link>
        </div>
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
