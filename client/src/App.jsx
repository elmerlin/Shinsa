import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TournamentSetup from './pages/TournamentSetup';
import TournamentView from './pages/TournamentView';
import MatchView from './pages/MatchView';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isAdmin = location.pathname === '/admin';

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
            {isHome && (
              <Link to="/admin" className="text-sm text-gray-500 hover:text-piu-accent transition-colors font-display">
                Admin
              </Link>
            )}
            {!isHome && !isAdmin && (
              <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors font-display">
                All Tournaments
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
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-piu-border py-3 sm:py-4 text-center text-xs text-gray-600">
        <span className="font-display tracking-wider text-piu-gold">PUMP DOJO</span>
        {' '}
        <span className="font-display tracking-wider">SHINSA</span>
        {' '}- PIU Tournament System
      </footer>
    </div>
  );
}
