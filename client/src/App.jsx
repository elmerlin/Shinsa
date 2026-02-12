import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TournamentSetup from './pages/TournamentSetup';
import TournamentView from './pages/TournamentView';
import MatchView from './pages/MatchView';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-piu-border bg-piu-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-piu-accent to-purple-700 rounded-lg flex items-center justify-center font-display text-lg font-bold shadow-lg shadow-piu-accent/20 group-hover:shadow-piu-accent/40 transition-shadow">
              S
            </div>
            <div>
              <span className="font-display font-bold text-xl tracking-wider group-hover:text-piu-accent transition-colors">
                SHINSA
              </span>
              <span className="text-gray-600 text-xs block -mt-1 font-display">PIU Tournament</span>
            </div>
          </Link>
          {!isHome && (
            <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors font-display">
              All Tournaments
            </Link>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tournament/new" element={<TournamentSetup />} />
          <Route path="/tournament/:id/*" element={<TournamentView />} />
          <Route path="/match/:id" element={<MatchView />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-piu-border py-4 text-center text-xs text-gray-600">
        <span className="font-display tracking-wider">SHINSA</span> - Pump It Up Tournament System
      </footer>
    </div>
  );
}
