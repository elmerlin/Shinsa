import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useNotifications } from './contexts/NotificationContext';
import { getAvatarUrl } from './components/AvatarPicker';
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

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      {/* Profile pic/name → navigates to public profile */}
      <div className="flex items-center gap-2">
        <Link
          to={`/profile/${user.id}`}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
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

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-piu-card border border-piu-border rounded-xl shadow-2xl z-50 py-1">
          <Link
            to={`/profile/${user.id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-display hover:bg-piu-dark/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My Profile
          </Link>
          <Link
            to="/posts"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-display hover:bg-piu-dark/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Posts
          </Link>
          <Link
            to="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-display hover:bg-piu-dark/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Profile Settings
          </Link>
          <div className="border-t border-piu-border/30 my-1" />
          <button
            onClick={() => { logout(); navigate('/'); setOpen(false); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-display text-red-400 hover:bg-piu-dark/50 transition-colors w-full text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const { user } = useAuth();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-piu-border bg-piu-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 sm:gap-3 group">
            <img
              src="/pump-dojo-logo.svg"
              alt="Pump Dojo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg shadow-lg shadow-piu-accent/20 group-hover:shadow-piu-accent/40 transition-shadow"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-lg sm:text-xl tracking-wider text-piu-gold group-hover:text-piu-accent transition-colors">
                  PUMP DOJO
                </span>
                <span className="font-display font-bold text-lg sm:text-xl tracking-wider group-hover:text-piu-accent transition-colors">
                  SHINSA
                </span>
              </div>
              <span className="text-gray-600 text-[10px] sm:text-xs block -mt-1 font-display">PIU Tournament System</span>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {!isHome && (
              <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors font-display">
                Home
              </Link>
            )}
            {user && (
              <Link to="/feed" className="text-sm text-gray-400 hover:text-white transition-colors font-display">
                Feed
              </Link>
            )}
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

      {/* Main */}
      <main className="flex-1">
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
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/account" element={<MyAccountPage />} />
          <Route path="/online-duel/new" element={<OnlineDuelSetup />} />
          <Route path="/online-duel/:id" element={<OnlineDuelRoom />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/posts" element={<PostsPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-piu-border py-3 sm:py-4 text-center text-xs text-gray-600">
        <span className="font-display tracking-wider text-piu-gold">PUMP DOJO</span>
        {' '}
        <span className="font-display tracking-wider">SHINSA</span>
        {' '}- Made by Elmer with ❤
      </footer>
    </div>
  );
}
