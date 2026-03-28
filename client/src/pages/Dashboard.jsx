import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, deleteTournament, searchTournaments, deleteDuel, getOnlineDuels, deleteOnlineDuel, getRecentActivity, getFeaturedCommunities, getLiveSessions, joinCommunity, getDailyHighlights, getJacketMap, getChartKeyMap } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../utils/countryFlags';
import { renderFormattedText } from '../utils/formatText';
import { extractCommunityPalette } from '../utils/communityColors';
import TournamentShowcaseCard from '../components/TournamentShowcaseCard';
import CommunityShowcaseCard from '../components/CommunityShowcaseCard';

const LiveDirectoryCard = lazy(() => import('../components/LiveDirectoryCard'));
const ArchiveBrowser = lazy(() => import('../components/tournament/ArchiveBrowser'));
const DailyHighlights = lazy(() => import('../components/DailyHighlights'));
const WeeklyChallengesSummary = lazy(() => import('../components/weeklyChallenges/WeeklyChallengesSummary'));

function timeAgo(dateStr) {
  const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const ACTIVITY_ICONS = {
  new_user: { icon: '👤', color: 'text-piu-accent' },
  upscore: { icon: '📈', color: 'text-piu-green' },
  new_clear: { icon: '🎯', color: 'text-sky-400' },
  new_post: { icon: '📝', color: 'text-purple-400' },
  new_tournament: { icon: '🏆', color: 'text-piu-gold' },
  new_duel: { icon: '⚔️', color: 'text-red-400' },
  new_online_duel: { icon: '🌐', color: 'text-blue-400' },
  tournament_win: { icon: '🥇', color: 'text-piu-gold' },
  duel_win: { icon: '🏅', color: 'text-amber-400' },
  online_duel_win: { icon: '🏅', color: 'text-blue-400' },
};

const DEFERRED_SECTION_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '420px',
};

function scheduleLowPriorityTask(task) {
  if (typeof window === 'undefined') {
    task();
    return () => {};
  }
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(task, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const timeoutId = window.setTimeout(task, 250);
  return () => window.clearTimeout(timeoutId);
}

function DashboardSectionFallback({ className = 'mb-6', heightClass = 'h-28' }) {
  return (
    <div className={className}>
      <div className={`w-full animate-pulse rounded-2xl border border-piu-border/30 bg-piu-card/50 ${heightClass}`} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [duels, setDuels] = useState([]);
  const [onlineDuels, setOnlineDuels] = useState([]);
  const [notices, setNotices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [featuredCommunities, setFeaturedCommunities] = useState([]);
  const [liveSessions, setLiveSessions] = useState([]);
  const [joiningCommunity, setJoiningCommunity] = useState(null);
  const [communityPalettes, setCommunityPalettes] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [dailyHighlights, setDailyHighlights] = useState(null);
  const [jacketLookup, setJacketLookup] = useState({});
  const [chartKeyMap, setChartKeyMap] = useState({});

  const matchesSearch = (value, q) => String(value || '').toLowerCase().includes(q);
  const duelMatchesSearch = (duel, q) => (
    matchesSearch(duel.name, q)
    || matchesSearch(duel.location, q)
    || matchesSearch(duel.player1_name, q)
    || matchesSearch(duel.player2_name, q)
  );

  useEffect(() => {
    let cancelled = false;

    // Load the primary home rails in as few critical requests as possible.
    getDashboard()
      .then((data) => {
        if (cancelled) return;
        setTournaments(Array.isArray(data?.tournaments) ? data.tournaments : []);
        setDuels(Array.isArray(data?.duels) ? data.duels : []);
        setNotices(Array.isArray(data?.notices) ? data.notices : []);
      })
      .catch(() => {});

    getOnlineDuels().then((rows) => {
      if (!cancelled) setOnlineDuels(Array.isArray(rows) ? rows : []);
    }).catch(() => {});

    getRecentActivity().then((rows) => {
      if (!cancelled) setRecentActivity(Array.isArray(rows) ? rows : []);
    }).catch(() => {});

    const cancelDeferredLoad = scheduleLowPriorityTask(() => {
      getDailyHighlights().then((data) => {
        if (!cancelled) setDailyHighlights(data || null);
      }).catch(() => {});
      getJacketMap().then((map) => {
        if (!cancelled) setJacketLookup(map || {});
      }).catch(() => {});
      getChartKeyMap().then((map) => {
        if (!cancelled) setChartKeyMap(map || {});
      }).catch(() => {});
      getFeaturedCommunities()
        .then((rows) => {
          if (cancelled) return;
          setFeaturedCommunities((rows || []).map((community) => ({
            ...community,
            joined: !!community.joined,
            pending_request: !!community.pending_request,
          })));
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      cancelDeferredLoad();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setLiveSessions([]);
      return undefined;
    }

    let cancelled = false;
    const loadLive = async () => {
      try {
        const data = await getLiveSessions({ limit: 3 });
        if (!cancelled) setLiveSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      } catch {
        if (!cancelled) setLiveSessions([]);
      }
    };

    loadLive();
    const interval = setInterval(loadLive, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const missing = featuredCommunities.filter((community) => community.avatar && !communityPalettes[community.id]);
    if (missing.length === 0) return undefined;

    Promise.all(missing.map(async (community) => {
      const palette = await extractCommunityPalette(getAvatarUrl(community.avatar));
      return { id: community.id, palette };
    })).then((entries) => {
      if (cancelled) return;
      setCommunityPalettes((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry.palette) next[entry.id] = entry.palette;
        }
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [featuredCommunities, communityPalettes]);

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const normalized = q.trim().toLowerCase();
      const [tournamentResults] = await Promise.all([
        searchTournaments(q),
      ]);
      const duelResults = duels.filter(d => duelMatchesSearch(d, normalized));
      const onlineDuelResults = onlineDuels.filter(d => duelMatchesSearch(d, normalized));
      setSearchResults({
        tournaments: tournamentResults,
        duels: duelResults,
        onlineDuels: onlineDuelResults,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }, [duels, onlineDuels]);

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
  }, [searchQuery, handleSearch]);

  const handleDelete = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    await deleteTournament(id);
    setTournaments(t => t.filter(x => x.id !== id));
    if (searchResults) {
      setSearchResults(sr => (sr ? {
        ...sr,
        tournaments: sr.tournaments.filter(x => x.id !== id),
      } : sr));
    }
  };

  const handleDeleteDuel = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this duel? This cannot be undone.')) return;
    try {
      await deleteDuel(id);
      setDuels(d => d.filter(x => x.id !== id));
      if (searchResults) {
        setSearchResults(sr => (sr ? {
          ...sr,
          duels: sr.duels.filter(x => x.id !== id),
        } : sr));
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteOnlineDuel = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this online duel? This cannot be undone.')) return;
    try {
      await deleteOnlineDuel(id);
      setOnlineDuels(d => d.filter(x => x.id !== id));
      if (searchResults) {
        setSearchResults(sr => (sr ? {
          ...sr,
          onlineDuels: sr.onlineDuels.filter(x => x.id !== id),
        } : sr));
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const displayTournaments = searchResults !== null ? searchResults.tournaments : tournaments;
  const displayDuels = searchResults !== null ? searchResults.duels : duels;
  const displayOnlineDuels = searchResults !== null ? searchResults.onlineDuels : onlineDuels;
  const totalSearchResults = searchResults === null
    ? 0
    : (searchResults.tournaments.length + searchResults.duels.length + searchResults.onlineDuels.length);

  const DuelCard = ({ d }) => {
    const creatorUserId = d.creator_user_id || d.player1_user_id || '';
    const canDeleteDuel = !!(user && creatorUserId && creatorUserId === user.id);

    return (
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
                <img src={getAvatarUrl(d.player1_avatar)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
                <img src={getAvatarUrl(d.player2_avatar)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
          {canDeleteDuel && (
            <button
              onClick={(e) => handleDeleteDuel(e, d.id)}
              className="text-gray-600 hover:text-red-500 transition-colors p-1"
              title="Delete duel"
            >
              &#10005;
            </button>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="grid grid-cols-4 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2">
          <Link
            to="/live"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-700 border border-cyan-200/30 text-white font-display font-bold text-[11px] sm:text-sm tracking-wide shadow-lg shadow-cyan-900/30 hover:brightness-110 transition-all whitespace-nowrap min-h-[40px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Live
          </Link>
          <Link
            to="/songs"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-700 border border-emerald-200/30 text-white font-display font-bold text-[11px] sm:text-sm tracking-wide shadow-lg shadow-emerald-900/30 hover:brightness-110 transition-all whitespace-nowrap min-h-[40px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-2v13M9 19a2 2 0 11-4 0 2 2 0 014 0Zm12-2a2 2 0 11-4 0 2 2 0 014 0Z" />
            </svg>
            Songs
          </Link>
          <Link
            to="/lists"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-700 border border-violet-200/30 text-white font-display font-bold text-[11px] sm:text-sm tracking-wide shadow-lg shadow-violet-900/30 hover:brightness-110 transition-all whitespace-nowrap min-h-[40px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Lists
          </Link>
          <Link
            to="/training"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-700 border border-amber-200/30 text-white font-display font-bold text-[11px] sm:text-sm tracking-wide shadow-lg shadow-amber-900/30 hover:brightness-110 transition-all whitespace-nowrap min-h-[40px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Training
          </Link>
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

      {user && liveSessions.length > 0 && searchResults === null && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent">LIVE NOW</h2>
              <p className="text-xs text-gray-500">Jump into active Shinsa Live sessions from the home rail.</p>
            </div>
            <Link to="/live" className="flex items-center gap-1 text-xs font-display text-gray-400 transition-colors hover:text-piu-accent">
              Open directory
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <Suspense fallback={<DashboardSectionFallback className="mb-0" heightClass="h-40" />}>
            <div className="grid gap-3 xl:grid-cols-3">
              {liveSessions.map((item) => (
                <LiveDirectoryCard key={item?.session?.id || item?.session?.host_user_id || 'live-session'} item={item} compact />
              ))}
            </div>
          </Suspense>
        </div>
      )}

      {/* Recent Activity — top of page */}
      {recentActivity.length > 0 && searchResults === null && (
        <div className="mb-8">
          <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent mb-3">RECENT ACTIVITY</h2>
          <div className="card divide-y divide-piu-border/20">
            {recentActivity.slice(0, 10).map((a, i) => {
              const ai = ACTIVITY_ICONS[a.type] || { icon: '•', color: 'text-gray-400' };
              return (
                <Link
                  key={i}
                  to={a.link}
                  className="flex items-center gap-3 py-2.5 px-1 hover:bg-piu-dark/30 transition-colors rounded"
                >
                  <span className="text-base shrink-0 w-6 text-center">{ai.icon}</span>
                  {a.avatar && (
                    <img src={getAvatarUrl(a.avatar)} alt="" className="w-6 h-6 rounded-full object-cover border border-piu-border shrink-0" loading="lazy" decoding="async" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200 truncate">
                      {a.nationality && <span className="mr-1">{getCountryFlag(a.nationality)}</span>}
                      {renderFormattedText(a.message)}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(a.created_at)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {dailyHighlights && searchResults === null && (
        <div style={DEFERRED_SECTION_STYLE}>
          <Suspense fallback={<DashboardSectionFallback />}>
            <DailyHighlights data={dailyHighlights} jacketLookup={jacketLookup} chartKeyMap={chartKeyMap} />
          </Suspense>
        </div>
      )}

      {searchResults === null && (
        <div style={DEFERRED_SECTION_STYLE}>
          <Suspense fallback={<DashboardSectionFallback />}>
            <WeeklyChallengesSummary />
          </Suspense>
        </div>
      )}

      {/* Communities Section */}
      {featuredCommunities.length > 0 && searchResults === null && (
        <div className="mb-8" style={DEFERRED_SECTION_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent">COMMUNITIES</h2>
            <Link to="/communities" className="flex items-center gap-1 text-xs font-display text-gray-400 hover:text-piu-accent transition-colors">
              See all
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {featuredCommunities.map(c => {
              const cardPalette = communityPalettes[c.id];
              const action = user && !c.joined && !c.pending_request ? (
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setJoiningCommunity(c.id);
                    try {
                      const result = await joinCommunity(c.id);
                      setFeaturedCommunities(prev => prev.map((fc) => {
                        if (fc.id !== c.id) return fc;
                        if (result?.status === 'pending') {
                          return { ...fc, pending_request: true };
                        }
                        return { ...fc, joined: true, member_count: (fc.member_count || 0) + 1 };
                      }));
                    } catch (err) {
                      if (!err.message.includes('Already')) alert(err.message);
                    } finally {
                      setJoiningCommunity(null);
                    }
                  }}
                  disabled={joiningCommunity === c.id}
                  className="rounded-full border border-piu-accent/30 bg-piu-accent/15 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.16em] text-piu-accent transition-colors hover:bg-piu-accent/25 disabled:opacity-50"
                >
                  {joiningCommunity === c.id ? 'Joining' : (c.is_invite_only ? 'Request' : 'Join')}
                </button>
              ) : user && c.pending_request ? (
                <span className="inline-flex rounded-full border border-yellow-400/20 bg-yellow-400/12 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.16em] text-yellow-300">
                  Pending
                </span>
              ) : null;

              return (
                <CommunityShowcaseCard
                  key={c.id}
                  community={c}
                  palette={cardPalette}
                  action={action}
                  className="h-full"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Online Duels Section */}
      {displayOnlineDuels.length > 0 && (
        <div className="mb-8" style={DEFERRED_SECTION_STYLE}>
          <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent mb-3">ONLINE DUELS</h2>
          <div className="grid gap-3">
            {displayOnlineDuels.map(d => (
              <Link
                key={d.id}
                to={`/online-duel/${d.id}`}
                className="card-hover flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center shrink-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-red-500/40 -mr-2 z-10">
                      {d.player1_avatar ? (
                        <img src={getAvatarUrl(d.player1_avatar)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-xs">
                          {(d.player1_name || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="w-5 h-5 bg-piu-card rounded-full flex items-center justify-center z-20 -mx-0.5">
                      <span className="text-piu-accent text-xs">&#9876;</span>
                    </div>
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-blue-500/40 -ml-2">
                      {d.player2_avatar ? (
                        <img src={getAvatarUrl(d.player2_avatar)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : d.player2_name ? (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-xs">
                          {d.player2_name[0].toUpperCase()}
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
                      <span>{d.player1_name} vs {d.player2_name || 'Waiting...'}</span>
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
      {displayDuels.length > 0 && (
        <div className="mb-8" style={DEFERRED_SECTION_STYLE}>
          <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent mb-3">OFFLINE DUELS</h2>
          <div className="grid gap-3">
            {displayDuels.map(d => <DuelCard key={d.id} d={d} />)}
          </div>
        </div>
      )}

      {/* Tournaments Section */}
      <div className="mb-6" style={DEFERRED_SECTION_STYLE}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-bold tracking-wider text-piu-accent">TOURNAMENTS</h2>
          <button
            onClick={() => setShowArchived(prev => !prev)}
            className="text-xs font-display font-bold text-gray-500 hover:text-piu-accent transition-colors"
          >
            {showArchived ? 'Hide Archived' : 'Archived'}
          </button>
        </div>

        {showArchived && (
          <div className="mb-6">
            <Suspense fallback={<DashboardSectionFallback className="mb-0" heightClass="h-64" />}>
              <ArchiveBrowser />
            </Suspense>
          </div>
        )}
        {displayTournaments.length === 0 ? (
          searchResults !== null ? (
            totalSearchResults === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-400">No tournaments, duels, or duel players found</p>
              </div>
            ) : null
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400">No tournaments yet</p>
              <p className="text-gray-600 mt-1 text-sm">Create your first tournament to get started</p>
            </div>
          )
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {displayTournaments.map((t) => (
              <TournamentShowcaseCard
                key={t.id}
                tournament={t}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create buttons + Search — below tournaments */}
      {searchResults === null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Link to="/tournament/new" className="btn-primary text-center text-sm block">
            + Tournament
          </Link>
          <Link to="/duel/new" className="btn-primary bg-gradient-to-r from-red-600 to-blue-600 hover:from-red-500 hover:to-blue-500 text-center text-sm block">
            + Offline Duel
          </Link>
          <Link to="/online-duel/new" className="btn-primary bg-gradient-to-r from-piu-accent to-piu-gold hover:from-piu-accent/80 hover:to-piu-gold/80 text-center text-sm block">
            + Online Duel
          </Link>
          <Link to="/community/new" className="btn-primary bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-center text-sm block">
            + Community
          </Link>
        </div>
      )}

      {/* Tournament Search */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            className="input-field w-full pl-10"
            placeholder="Search tournaments, duels, locations, players..."
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
              {totalSearchResults} result{totalSearchResults !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
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
