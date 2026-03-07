import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from './contexts/AuthContext';
import { useNotifications } from './contexts/NotificationContext';
import { getAvatarUrl } from './components/AvatarPicker';
import MarkdownContent from './components/MarkdownContent';
import { searchUsers, consumeGroupPopup, getMyCheckinStatus, checkout } from './utils/api';
import { getProfilePath } from './utils/profile';
import { getCountryFlag } from './components/PlayerRegistration';
import Dashboard from './pages/Dashboard';
import TournamentSetup from './pages/TournamentSetup';
import TournamentView from './pages/TournamentView';
import MatchView from './pages/MatchView';
import DuelSetup from './pages/DuelSetup';
import DuelView from './pages/DuelView';
import AdminPanel from './pages/AdminPanel';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import MyAccountPage from './pages/MyAccountPage';
import OnlineDuelSetup from './pages/OnlineDuelSetup';
import OnlineDuelRoom from './pages/OnlineDuelRoom';
import FeedPage from './pages/FeedPage';
import PostsPage from './pages/PostsPage';
import { SinglePostPage, SingleUpscorePage, SingleClearPage } from './pages/SingleItemPage';
import CommunityPage from './pages/CommunityPage';
import CommunitySetupPage from './pages/CommunitySetupPage';
import CommunitySettingsPage from './pages/CommunitySettingsPage';
import CommunitiesListPage from './pages/CommunitiesListPage';
import WorldMaxPage from './pages/WorldMaxPage';
import WorldMaxMachinePage from './pages/WorldMaxMachinePage';
import SongsPage from './pages/SongsPage';
import ShoesPage from './pages/ShoesPage';
import SongChartPage from './pages/SongChartPage';
import HeadToHeadPage from './pages/HeadToHeadPage';
import ListsPage from './pages/ListsPage';
import TiersPage from './pages/TiersPage';
import SkillsPage from './pages/SkillsPage';
import SkillChartsPage from './pages/SkillChartsPage';
import ChatPage from './pages/ChatPage';
import FunPage from './pages/FunPage';
import OptimisePage from './pages/OptimisePage';
import ChangeLogPage from './pages/ChangeLogPage';
import CheckinPage from './pages/CheckinPage';
import DojoPage from './pages/DojoPage';
import LeaderboardsPage from './pages/LeaderboardsPage';
import LivePage from './pages/LivePage';
import LiveOverlayPage from './pages/LiveOverlayPage';

const DOJO_TARGET_GROUP = 'pump dojo';
const DOJO_VENUE_SLUG = 'london-pump-dojo';
const DOJO_POPUP_STORAGE_PREFIX = 'dojo-proximity-popup-last-shown';
const DOJO_CHECKOUT_POPUP_STORAGE_PREFIX = 'dojo-checkout-popup-last-shown';
const DOJO_RECHECK_DEFAULT_MS = 60 * 60 * 1000;
const DOJO_RECHECK_NEARBY_MS = 10 * 60 * 1000;
const DOJO_NEARBY_RADIUS_METERS = 3000;
const DOJO_CHECKOUT_REMINDER_COOLDOWN_MS = 30 * 60 * 1000;
const DOJO_GEO_TIMEOUT_MS = 10000;
const DOJO_GEO_MAX_AGE_MS = 120000;
const DOJO_GEOFENCE = {
  name: 'London Pump Dojo',
  address: 'Unit 5, 2 Wadsworth Rd, Perivale, Greenford UB6 7JD',
  lat: 51.53639,
  lng: -0.31489,
  radiusMeters: 180,
  maxAccuracyMeters: 120,
};

function normalizeGroupName(value) {
  return String(value || '').trim().toLowerCase();
}

function isPumpDojoMember(user) {
  if (!user) return false;
  const groups = Array.isArray(user.groups) ? user.groups : [];
  return groups.some((group) => normalizeGroupName(group?.name) === DOJO_TARGET_GROUP);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function todayLocalKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function msUntilNextLocalDay() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function getDojoCheckoutPopupStorageKey(userId) {
  return `${DOJO_CHECKOUT_POPUP_STORAGE_PREFIX}:${String(userId || '').trim()}`;
}

function readDojoCheckoutPopupState(userId) {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(getDojoCheckoutPopupStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const checkinId = String(parsed?.checkinId || '').trim();
    const shownAt = Number(parsed?.shownAt || 0);
    if (!checkinId || !Number.isFinite(shownAt) || shownAt <= 0) return null;
    return { checkinId, shownAt };
  } catch {
    return null;
  }
}

function markDojoCheckoutPopupShown(userId, checkinId) {
  if (typeof window === 'undefined' || !userId || !checkinId) return;
  try {
    localStorage.setItem(
      getDojoCheckoutPopupStorageKey(userId),
      JSON.stringify({ checkinId: String(checkinId), shownAt: Date.now() })
    );
  } catch {
    // Ignore storage failures.
  }
}

function clearDojoCheckoutPopupState(userId) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(getDojoCheckoutPopupStorageKey(userId));
  } catch {
    // Ignore storage failures.
  }
}

function getDojoCheckoutReminderRemainingMs(userId, checkinId) {
  const state = readDojoCheckoutPopupState(userId);
  if (!state || state.checkinId !== String(checkinId || '')) return 0;
  const remainingMs = DOJO_CHECKOUT_REMINDER_COOLDOWN_MS - (Date.now() - state.shownAt);
  return remainingMs > 0 ? remainingMs : 0;
}

function NotificationBell() {
  const { notifications, totalBadge, unreadCount, invitationCount, markRead, markAllRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-gray-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {totalBadge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-h-96 overflow-y-auto bg-piu-card border border-piu-border rounded-xl shadow-2xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-piu-border/50">
            <span className="font-display font-bold text-xs text-gray-400">NOTIFICATIONS</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[10px] text-piu-accent hover:underline">Mark all read</button>
            )}
          </div>

          {invitationCount > 0 && (
            <Link
              to="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 bg-piu-accent/10 hover:bg-piu-accent/20 transition-colors border-b border-piu-border/30"
            >
              <span className="text-piu-accent text-sm">&#9993;</span>
              <span className="text-sm font-display font-bold text-piu-accent">
                {invitationCount} pending invitation{invitationCount > 1 ? 's' : ''}
              </span>
            </Link>
          )}

          {notifications.length === 0 && invitationCount === 0 && (
            <p className="text-center text-gray-500 text-xs py-6">No notifications</p>
          )}

          {notifications.map(n => (
            <div
              key={n.id}
              className={`flex items-start gap-2 px-3 py-2.5 border-b border-piu-border/20 hover:bg-piu-dark/50 transition-colors cursor-pointer ${!n.read ? 'bg-piu-dark/30' : ''}`}
              onClick={() => {
                if (!n.read) markRead(n.id);
                if (n.link) { navigate(n.link); setOpen(false); }
              }}
            >
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${!n.read ? 'bg-piu-accent' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display font-bold truncate">{n.title}</p>
                {n.message && <p className="text-[10px] text-gray-500 truncate">{n.message}</p>}
                <p className="text-[10px] text-gray-600 mt-0.5">{new Date(n.created_at + 'Z').toLocaleString()}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                className="text-gray-600 hover:text-red-400 text-xs shrink-0"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const debounceRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (!ref.current || ref.current.contains(e.target)) return;
      setOpen(false);
      setExpanded(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  const handleChange = (val) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 1) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const users = await searchUsers(val.trim());
        setResults(users);
        setOpen(users.length > 0);
      } catch { setResults([]); }
    }, 250);
  };

  const goToUser = (user) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    setExpanded(false);
    navigate(getProfilePath(user?.id, user?.username));
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center justify-end gap-1">
        <div
          className={`overflow-hidden transition-all duration-200 ${expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ width: expanded ? 'min(20rem, calc(100vw - 10rem))' : 0 }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setExpanded(false);
                setOpen(false);
              }
            }}
            placeholder="Search players..."
            className="w-full bg-piu-dark border border-piu-border rounded-lg text-xs py-1.5 px-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-piu-accent/50 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded((prev) => {
              const next = !prev;
              if (!next) setOpen(false);
              return next;
            });
          }}
          className="p-1.5 text-gray-400 hover:text-white transition-colors"
          aria-label="Search players"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-piu-card border border-piu-border rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto">
          {results.map(u => {
            const flag = getCountryFlag(u.nationality);
            return (
              <button
                key={u.id}
                onClick={() => goToUser(u)}
                className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-piu-dark/50 transition-colors text-left"
              >
                {u.avatar ? (
                  <img src={getAvatarUrl(u.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-piu-border" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
                    {(u.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-display font-bold truncate">
                    {flag && <span className="mr-1">{flag}</span>}
                    {u.username}
                  </p>
                  {u.skill_title && <p className="text-[10px] text-gray-500 truncate">{u.skill_title}</p>}
                </div>
                {u.pumbility > 0 && (
                  <span className="text-[10px] font-mono text-piu-accent">{u.pumbility}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!user) return null;
  const myProfilePath = getProfilePath(user.id, user.username);
  const canAccessOptimise = !!(user?.is_admin || user?.feature_access?.optimise);
  const canAccessCheckin = !!(user?.is_admin || user?.feature_access?.checkin || user?.feature_access?.dojo_admin);
  const canAccessDojo = !!user?.feature_access?.dojo_admin;
  const canAccessAdmin = !!user?.is_admin;
  const menuLinkClass = 'flex items-center gap-2 px-3 py-2 text-sm font-display hover:bg-piu-dark/50 transition-colors';
  const closeMenu = () => setOpen(false);
  const drawer = open && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[110]">
      <button
        type="button"
        aria-label="Close menu"
        onClick={closeMenu}
        className="absolute inset-0 z-0 bg-black/55 backdrop-blur-[1px]"
      />
      <aside className="absolute right-0 top-0 z-10 h-full w-[56vw] max-w-[240px] border-l border-piu-border bg-piu-card shadow-2xl overflow-y-auto overscroll-contain sm:w-[320px] sm:max-w-[320px]">
        <div className="sticky top-0 z-10 px-3 py-2.5 border-b border-piu-border/60 bg-piu-card/95 backdrop-blur-sm flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2.5">
            {user.avatar ? (
              <img src={getAvatarUrl(user.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
                {user.username[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-display font-bold text-gray-200 truncate">{user.username}</p>
              <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Menu</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeMenu}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close menu drawer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="py-1">
          <Link
            to={myProfilePath}
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My Profile
          </Link>
          <Link
            to="/posts"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Posts
          </Link>
          <Link
            to="/live"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Shinsa Live
          </Link>
          <Link
            to="/world-max"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
            </svg>
            World Max
          </Link>
          <Link
            to="/songs"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-2v13M9 19a2 2 0 11-4 0 2 2 0 014 0Zm12-2a2 2 0 11-4 0 2 2 0 014 0Z" />
            </svg>
            Songs
          </Link>
          <Link
            to="/lists"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Lists
          </Link>
          <Link
            to="/leaderboards"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 6v12M12 6v12M17 6v12" />
            </svg>
            Leaderboards
          </Link>
          <Link
            to="/shoes"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 16h12M5 20h14M7 8c0-1.657 1.343-3 3-3h5v3a3 3 0 0 1-3 3H7V8Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11h3a2 2 0 0 1 2 2v3h-5v-5Z" />
            </svg>
            Shoes
          </Link>
          {canAccessOptimise && (
            <Link
              to="/optimise"
              onClick={closeMenu}
              className={menuLinkClass}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h3M9 12h6M7.5 18h9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7a2 2 0 012-2h1m10 0h1a2 2 0 012 2v1m0 8v1a2 2 0 01-2 2h-1m-10 0H6a2 2 0 01-2-2v-1m0-8V7" />
              </svg>
              Optimise
            </Link>
          )}
          <Link
            to="/tiers"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h14M3 18h10" />
            </svg>
            Tiers
          </Link>
          <Link
            to="/head-to-head"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 10V8a2 2 0 012-2h4a3 3 0 013 3v9H9a4 4 0 01-4-4v-3a1 1 0 011-1h1Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h2V7a1 1 0 10-2 0v3Zm3 0h2V7a1 1 0 10-2 0v3Z" />
            </svg>
            Rivals
          </Link>
          <Link
            to="/fun"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0Zm6 0a9 9 0 11-18 0 9 9 0 0118 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 15.5h8" />
            </svg>
            Fun
          </Link>
          {canAccessCheckin && (
            <Link
              to="/checkin"
              onClick={closeMenu}
              className={menuLinkClass}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Check In
            </Link>
          )}
          {canAccessDojo && (
            <Link
              to="/dojo"
              onClick={closeMenu}
              className={menuLinkClass}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M6 7v10a2 2 0 002 2h8a2 2 0 002-2V7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6M9 15h4" />
              </svg>
              Dojo
            </Link>
          )}
          <Link
            to="/changelog"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5a2 2 0 002 2h2a2 2 0 002-2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h6" />
            </svg>
            Changelog
          </Link>
          <Link
            to="/account"
            onClick={closeMenu}
            className={menuLinkClass}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Profile Settings
          </Link>
          {canAccessAdmin && (
            <Link
              to="/admin"
              onClick={closeMenu}
              className={menuLinkClass}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12.5l2 2 3-3" />
              </svg>
              Admin
            </Link>
          )}
          <div className="border-t border-piu-border/30 my-1" />
          <button
            onClick={() => { logout(); navigate('/'); closeMenu(); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-display text-red-400 hover:bg-piu-dark/50 transition-colors w-full text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      {/* Profile pic/name → navigates to public profile */}
      <div className="flex items-center gap-2">
        <Link
          to={myProfilePath}
          className="hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          {user.avatar ? (
            <img src={getAvatarUrl(user.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-piu-border" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
              {user.username[0].toUpperCase()}
            </div>
          )}
          <span className="text-sm font-display text-gray-300 hidden sm:inline">{user.username}</span>
        </Link>

        {/* Hamburger menu */}
        <button
          onClick={() => setOpen(!open)}
          className="p-1 text-gray-400 hover:text-white transition-colors"
          aria-label="Menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {drawer}
    </div>
  );
}

function GroupLoginPopupModal({ popup, slideIndex, onSlideChange, onClose }) {
  if (!popup) return null;
  const slides = Array.isArray(popup.slides) ? popup.slides : [];
  if (slides.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(slides.length - 1, slideIndex || 0));
  const slide = slides[safeIndex] || {};

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-piu-border bg-[#0b1324] shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Announcement</p>
            <h3 className="text-base font-display font-bold text-piu-accent truncate">
              {popup.title || 'Group Update'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400 font-display">
              Slide {safeIndex + 1} of {slides.length}
            </p>
            <div className="h-1.5 w-28 rounded-full bg-piu-dark/70 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-piu-accent to-pink-500"
                style={{ width: `${((safeIndex + 1) / slides.length) * 100}%` }}
              />
            </div>
          </div>

          {slide.title ? (
            <h4 className="text-lg font-display font-bold text-white">{slide.title}</h4>
          ) : null}

          <div className="rounded-xl border border-piu-border/40 bg-piu-dark/30 p-3 max-h-[50vh] overflow-y-auto">
            {slide.content ? (
              <MarkdownContent text={slide.content} />
            ) : (
              <p className="text-sm text-gray-500">No content on this slide.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => onSlideChange(Math.max(0, safeIndex - 1))}
              disabled={safeIndex <= 0}
            >
              Previous
            </button>
            {safeIndex < slides.length - 1 ? (
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => onSlideChange(Math.min(slides.length - 1, safeIndex + 1))}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={onClose}
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DojoProximityPopupModal({ onClose, onOpenCheckin }) {
  return (
    <div className="fixed inset-0 z-[96] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-piu-border bg-[#0b1324] shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Nearby Dojo</p>
            <h3 className="text-base font-display font-bold text-piu-accent truncate">
              You are near {DOJO_GEOFENCE.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4 space-y-4">
          <p className="text-sm text-gray-300">
            Open check-in now?
          </p>
          <p className="text-xs text-gray-500">
            {DOJO_GEOFENCE.address}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={onClose}
            >
              Not now
            </button>
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={onOpenCheckin}
            >
              Open Check In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DojoCheckoutPopupModal({ prompt, loading, error, onClose, onCheckout }) {
  const machineLabel = String(prompt?.machineName || '').trim();
  return (
    <div className="fixed inset-0 z-[96] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-piu-border bg-[#0b1324] shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Check Out Reminder</p>
            <h3 className="text-base font-display font-bold text-red-300 truncate">
              You appear to have left {DOJO_GEOFENCE.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-60"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4 space-y-4">
          <p className="text-sm text-gray-300">
            {machineLabel
              ? `You are still checked in on ${machineLabel}. Check out now?`
              : 'You are still checked in. Check out now?'}
          </p>
          <p className="text-xs text-gray-500">
            {DOJO_GEOFENCE.address}
          </p>
          {error && (
            <p className="text-xs text-red-300 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={onClose}
              disabled={loading}
            >
              Later
            </button>
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={onCheckout}
              disabled={loading}
            >
              {loading ? 'Checking out...' : 'Check Out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groupPopup, setGroupPopup] = useState(null);
  const [groupPopupSlide, setGroupPopupSlide] = useState(0);
  const [showDojoPopup, setShowDojoPopup] = useState(false);
  const [showDojoCheckoutPopup, setShowDojoCheckoutPopup] = useState(false);
  const [dojoCheckoutPrompt, setDojoCheckoutPrompt] = useState(null);
  const [dojoCheckoutLoading, setDojoCheckoutLoading] = useState(false);
  const [dojoCheckoutError, setDojoCheckoutError] = useState('');
  const consumedPopupUserRef = useRef('');
  const isHome = location.pathname === '/';
  const isLiveOverlay = /^\/live\/[^/]+\/overlay(?:\/|$)/.test(location.pathname);
  const canAccessCheckin = !!(user?.is_admin || user?.feature_access?.checkin || user?.feature_access?.dojo_admin);
  const canAccessDojo = !!user?.feature_access?.dojo_admin;
  const canShowDojoPopup = canAccessCheckin && isPumpDojoMember(user);
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!user?.id) {
      consumedPopupUserRef.current = '';
      setGroupPopup(null);
      setGroupPopupSlide(0);
      return;
    }
    if (consumedPopupUserRef.current === user.id) return;
    consumedPopupUserRef.current = user.id;
    consumeGroupPopup()
      .then((payload) => {
        const popup = payload?.popup || null;
        if (!popup || !Array.isArray(popup.slides) || popup.slides.length === 0) {
          setGroupPopup(null);
          setGroupPopupSlide(0);
          return;
        }
        setGroupPopup(popup);
        setGroupPopupSlide(0);
      })
      .catch(() => {
        setGroupPopup(null);
        setGroupPopupSlide(0);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !canAccessCheckin) {
      setShowDojoPopup(false);
      setShowDojoCheckoutPopup(false);
      setDojoCheckoutPrompt(null);
      setDojoCheckoutError('');
      return;
    }
    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
      return;
    }

    const storageKey = `${DOJO_POPUP_STORAGE_PREFIX}:${user.id}`;
    let cancelled = false;
    let running = false;
    let timeoutId = null;

    const getStoredDay = () => {
      try {
        return localStorage.getItem(storageKey) || '';
      } catch {
        return '';
      }
    };

    const markShownToday = () => {
      try {
        localStorage.setItem(storageKey, todayLocalKey());
      } catch {
        // Ignore storage failures.
      }
    };

    const scheduleNext = (delayMs) => {
      if (cancelled) return;
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        runCheck();
      }, Math.max(1000, Math.round(delayMs || 0)));
    };

    const runCheck = () => {
      if (cancelled || running) return;
      if (document.visibilityState === 'hidden') return;

      running = true;
      getMyCheckinStatus()
        .then((status) => {
          if (cancelled) {
            running = false;
            return;
          }

          const activeCheckin = status?.checked_in ? status.checkin : null;
          const checkedIntoDojo = activeCheckin?.venue_slug === DOJO_VENUE_SLUG;

          if (!checkedIntoDojo) {
            clearDojoCheckoutPopupState(user.id);
            setShowDojoCheckoutPopup(false);
            setDojoCheckoutPrompt(null);
            setDojoCheckoutError('');
          }

          if (activeCheckin && !checkedIntoDojo) {
            setShowDojoPopup(false);
            running = false;
            scheduleNext(DOJO_RECHECK_DEFAULT_MS);
            return;
          }

          if (!checkedIntoDojo && !canShowDojoPopup) {
            setShowDojoPopup(false);
            running = false;
            scheduleNext(DOJO_RECHECK_DEFAULT_MS);
            return;
          }

          if (!checkedIntoDojo && getStoredDay() === todayLocalKey()) {
            setShowDojoPopup(false);
            running = false;
            scheduleNext(msUntilNextLocalDay());
            return;
          }

          navigator.geolocation.getCurrentPosition(
        (position) => {
          running = false;
          if (cancelled) return;
          const lat = Number(position?.coords?.latitude);
          const lng = Number(position?.coords?.longitude);
          const accuracy = Number(position?.coords?.accuracy);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            scheduleNext(checkedIntoDojo ? DOJO_RECHECK_NEARBY_MS : DOJO_RECHECK_DEFAULT_MS);
            return;
          }

          const distanceMeters = haversineDistanceMeters(lat, lng, DOJO_GEOFENCE.lat, DOJO_GEOFENCE.lng);
          const accuracyOk = !Number.isFinite(accuracy) || accuracy <= DOJO_GEOFENCE.maxAccuracyMeters;
          if (checkedIntoDojo) {
            setShowDojoPopup(false);
            if (!accuracyOk) {
              scheduleNext(DOJO_RECHECK_NEARBY_MS);
              return;
            }
            if (distanceMeters > DOJO_GEOFENCE.radiusMeters) {
              const reminderRemainingMs = getDojoCheckoutReminderRemainingMs(user.id, activeCheckin?.id);
              if (reminderRemainingMs <= 0) {
                markDojoCheckoutPopupShown(user.id, activeCheckin?.id);
                setDojoCheckoutError('');
                setDojoCheckoutPrompt({
                  checkinId: activeCheckin?.id || '',
                  machineName: activeCheckin?.machine_name || '',
                });
                setShowDojoCheckoutPopup(true);
                scheduleNext(DOJO_CHECKOUT_REMINDER_COOLDOWN_MS);
                return;
              }
              scheduleNext(Math.min(reminderRemainingMs, DOJO_RECHECK_NEARBY_MS));
              return;
            }

            clearDojoCheckoutPopupState(user.id);
            setShowDojoCheckoutPopup(false);
            setDojoCheckoutPrompt(null);
            setDojoCheckoutError('');
            scheduleNext(DOJO_RECHECK_NEARBY_MS);
            return;
          }

          if (accuracyOk && distanceMeters <= DOJO_GEOFENCE.radiusMeters) {
            markShownToday();
            setShowDojoPopup(true);
            scheduleNext(msUntilNextLocalDay());
            return;
          }

          const nextDelay = distanceMeters <= DOJO_NEARBY_RADIUS_METERS
            ? DOJO_RECHECK_NEARBY_MS
            : DOJO_RECHECK_DEFAULT_MS;
          scheduleNext(nextDelay);
        },
        () => {
          running = false;
          if (cancelled) return;
          // Denied or unavailable: back off to sparse checks.
          scheduleNext(checkedIntoDojo ? DOJO_RECHECK_NEARBY_MS : DOJO_RECHECK_DEFAULT_MS);
        },
        {
          enableHighAccuracy: true,
          timeout: DOJO_GEO_TIMEOUT_MS,
          maximumAge: DOJO_GEO_MAX_AGE_MS,
        }
      );
        })
        .catch(() => {
          running = false;
          if (cancelled) return;
          scheduleNext(DOJO_RECHECK_DEFAULT_MS);
        });
    };

    const handleVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') {
        runCheck();
      }
    };

    runCheck();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      running = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [canAccessCheckin, canShowDojoPopup, user?.id]);

  const handleOpenDojoCheckin = () => {
    setShowDojoPopup(false);
    navigate('/checkin');
  };

  const handleCloseDojoCheckoutPopup = () => {
    setShowDojoCheckoutPopup(false);
    setDojoCheckoutError('');
  };

  const handleDojoCheckout = async () => {
    setDojoCheckoutLoading(true);
    setDojoCheckoutError('');
    try {
      await checkout();
      clearDojoCheckoutPopupState(user?.id);
      setShowDojoCheckoutPopup(false);
      setDojoCheckoutPrompt(null);
    } catch (err) {
      setDojoCheckoutError(err?.message || 'Failed to check out');
    } finally {
      setDojoCheckoutLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${isLiveOverlay ? '' : 'flex flex-col'}`}>
      {/* Header */}
      {!isLiveOverlay ? (
      <header className="border-b border-piu-border bg-piu-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <Link to="/" onClick={scrollToTop} className="group">
            <img
              src="/pump-shinsa-wordmark.svg"
              alt="Pump Shinsa"
              className="h-9 sm:h-10 w-auto drop-shadow-[0_0_8px_rgba(255,51,102,0.18)] group-hover:drop-shadow-[0_0_14px_rgba(58,170,255,0.3)] transition-all"
            />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {!isHome && (
              <Link to="/" onClick={scrollToTop} className="hidden sm:inline text-sm text-gray-400 hover:text-white transition-colors font-display">
                Home
              </Link>
            )}
            {user && (
              <Link to="/feed" className="hidden sm:inline text-sm text-gray-400 hover:text-white transition-colors font-display">
                Feed
              </Link>
            )}
            {user && (
              <Link to="/live" className="hidden sm:inline text-sm text-gray-400 hover:text-white transition-colors font-display">
                Live
              </Link>
            )}
            <Link to="/world-max" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors font-display">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
              </svg>
              <span>World Max</span>
            </Link>
            <Link to="/songs" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors font-display">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-2v13M9 19a2 2 0 11-4 0 2 2 0 014 0Zm12-2a2 2 0 11-4 0 2 2 0 014 0Z" />
              </svg>
              <span>Songs</span>
            </Link>
            <Link to="/lists" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors font-display">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>Lists</span>
            </Link>
            <Link to="/tiers" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors font-display">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h14M3 18h10" />
              </svg>
              <span>Tiers</span>
            </Link>
            {canAccessDojo && (
              <Link to="/dojo" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors font-display">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M6 7v10a2 2 0 002 2h8a2 2 0 002-2V7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6M9 15h4" />
                </svg>
                <span>Dojo</span>
              </Link>
            )}
            <Link to="/head-to-head" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors font-display">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 10V8a2 2 0 012-2h4a3 3 0 013 3v9H9a4 4 0 01-4-4v-3a1 1 0 011-1h1Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h2V7a1 1 0 10-2 0v3Zm3 0h2V7a1 1 0 10-2 0v3Z" />
              </svg>
              <span>Rivals</span>
            </Link>
            <Link to="/communities" className="hidden sm:inline text-sm text-gray-400 hover:text-white transition-colors font-display">
              Communities
            </Link>
            <UserSearch />
            {user ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <NotificationBell />
                <UserMenu />
              </div>
            ) : (
              <Link to="/login" className="text-sm text-piu-accent hover:text-piu-accent/80 transition-colors font-display font-bold">
                Login
              </Link>
            )}
          </div>
        </div>
      </header>
      ) : null}

      {/* Main */}
      <main className={isLiveOverlay ? 'min-h-screen' : `flex-1 ${user ? 'pb-16 sm:pb-0' : ''}`}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tournament/new" element={<TournamentSetup />} />
          <Route path="/tournament/:id/*" element={<TournamentView />} />
          <Route path="/match/:id" element={<MatchView />} />
          <Route path="/duel/new" element={<DuelSetup />} />
          <Route path="/duel/:id" element={<DuelView />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/:username" element={<ProfilePage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/account" element={<MyAccountPage />} />
        <Route path="/online-duel/new" element={<OnlineDuelSetup />} />
        <Route path="/online-duel/:id" element={<OnlineDuelRoom />} />
        <Route path="/live" element={<LivePage />} />
        <Route path="/live/:sessionId" element={<LivePage />} />
        <Route path="/live/:sessionId/overlay" element={<LiveOverlayPage />} />
        <Route path="/feed" element={<FeedPage />} />
          <Route path="/posts" element={<PostsPage />} />
          <Route path="/post/:id" element={<SinglePostPage />} />
          <Route path="/upscore/:id" element={<SingleUpscorePage />} />
          <Route path="/clear/:id" element={<SingleClearPage />} />
          <Route path="/communities" element={<CommunitiesListPage />} />
          <Route path="/community/new" element={<CommunitySetupPage />} />
          <Route path="/c/:communityName" element={<CommunityPage />} />
          <Route path="/c/:communityName/settings" element={<CommunitySettingsPage />} />
          <Route path="/world-max" element={<WorldMaxPage />} />
          <Route path="/world-max/machine/:id" element={<WorldMaxMachinePage />} />
          <Route path="/songs" element={<SongsPage />} />
          <Route path="/lists" element={<ListsPage />} />
          <Route path="/shoes" element={<ShoesPage />} />
          <Route path="/optimise" element={<OptimisePage />} />
          <Route path="/optimize" element={<OptimisePage />} />
          <Route path="/songs/chart/:chartId" element={<SongChartPage />} />
          <Route path="/skill" element={<SkillsPage />} />
          <Route path="/skill/:skillSlug" element={<SkillChartsPage />} />
          <Route path="/tiers" element={<TiersPage />} />
          <Route path="/head-to-head" element={<HeadToHeadPage />} />
          <Route path="/fun" element={<FunPage />} />
          <Route path="/motion" element={<Navigate to="/fun?tab=motion" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/changelog" element={<ChangeLogPage />} />
          <Route path="/checkin" element={<CheckinPage />} />
          <Route path="/dojo" element={<DojoPage />} />
          <Route path="/leaderboards" element={<LeaderboardsPage />} />
        </Routes>
      </main>

      {!isLiveOverlay && groupPopup && (
        <GroupLoginPopupModal
          popup={groupPopup}
          slideIndex={groupPopupSlide}
          onSlideChange={setGroupPopupSlide}
          onClose={() => {
            setGroupPopup(null);
            setGroupPopupSlide(0);
          }}
        />
      )}
      {!isLiveOverlay && showDojoPopup && !groupPopup && (
        <DojoProximityPopupModal
          onClose={() => setShowDojoPopup(false)}
          onOpenCheckin={handleOpenDojoCheckin}
        />
      )}
      {!isLiveOverlay && showDojoCheckoutPopup && !showDojoPopup && !groupPopup && (
        <DojoCheckoutPopupModal
          prompt={dojoCheckoutPrompt}
          loading={dojoCheckoutLoading}
          error={dojoCheckoutError}
          onClose={handleCloseDojoCheckoutPopup}
          onCheckout={handleDojoCheckout}
        />
      )}

      {/* Footer — hidden on mobile when logged in (bottom nav takes its place) */}
      {!isLiveOverlay ? (
      <footer className={`border-t border-piu-border py-3 sm:py-4 text-center text-xs text-gray-600 ${user ? 'hidden sm:block' : ''}`}>
        <span className="font-display tracking-wider text-piu-gold">PUMP</span>
        {' '}
        <span className="font-display tracking-wider">SHINSA</span>
        {' '}- PHOENIX 2026
      </footer>
      ) : null}

      {/* Mobile Bottom Navigation — Instagram style */}
      {!isLiveOverlay && user && <MobileBottomNav />}
    </div>
  );
}

function MobileBottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const path = location.pathname;
  const isActive = (p) => path === p || path.startsWith(p + '/');
  const profilePath = getProfilePath(user?.id, user?.username);
  const profileLegacyPath = user?.id ? `/profile/${user.id}` : '';
  const profileActive = profilePath ? (path === profilePath || path === profileLegacyPath) : false;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-piu-card border-t border-piu-border">
      <div className="flex items-center justify-around h-14 px-2">
        {/* Home */}
        <Link to="/" onClick={scrollToTop} className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 ${path === '/' ? 'text-piu-accent' : 'text-gray-500'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="text-[9px] font-display">Home</span>
        </Link>

        {/* Feed */}
        <Link to="/feed" className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 ${isActive('/feed') ? 'text-piu-accent' : 'text-gray-500'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <span className="text-[9px] font-display">Feed</span>
        </Link>

        {/* Add Post */}
        <Link to="/posts" className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 ${isActive('/posts') ? 'text-piu-accent' : 'text-gray-500'}`}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-piu-gold flex items-center justify-center -mt-3 shadow-lg shadow-piu-accent/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-[9px] font-display">Post</span>
        </Link>

        {/* Tiers */}
        <Link to="/tiers" className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 ${isActive('/tiers') ? 'text-piu-accent' : 'text-gray-500'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h12M4 17h8" />
          </svg>
          <span className="text-[9px] font-display">Tiers</span>
        </Link>

        {/* Profile */}
        <Link to={profilePath} onClick={scrollToTop} className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 ${profileActive ? 'text-piu-accent' : 'text-gray-500'}`}>
          {user.avatar ? (
            <img src={getAvatarUrl(user.avatar)} alt="" className={`w-5 h-5 rounded-full object-cover ${profileActive ? 'ring-1 ring-piu-accent' : ''}`} />
          ) : (
            <div className={`w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[8px] ${profileActive ? 'ring-1 ring-piu-accent' : ''}`}>
              {user.username[0].toUpperCase()}
            </div>
          )}
          <span className="text-[9px] font-display">Profile</span>
        </Link>
      </div>
    </nav>
  );
}
