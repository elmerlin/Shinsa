import React from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
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

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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
          <div className="flex items-center gap-3">
            {!isHome && (
              <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors font-display">
                Home
              </Link>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/account"
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
                <button
                  onClick={() => { logout(); navigate('/'); }}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors font-display"
                >
                  Logout
                </button>
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
