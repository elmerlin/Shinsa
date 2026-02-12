import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TournamentSetup from './pages/TournamentSetup';
import TournamentView from './pages/TournamentView';
import MatchView from './pages/MatchView';

function NavBar() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <nav className="bg-piu-dark/80 backdrop-blur-sm border-b border-piu-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 bg-gradient-to-br from-piu-accent to-pink-700 rounded-lg flex items-center justify-center font-display font-bold text-lg shadow-lg group-hover:shadow-piu-accent/30 transition-shadow">
            S
          </div>
          <span className="font-display text-xl font-bold tracking-wider">
            SHINSA
          </span>
        </Link>
        {!isHome && (
          <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">
            All Tournaments
          </Link>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tournament/new" element={<TournamentSetup />} />
          <Route path="/tournament/:id/*" element={<TournamentView />} />
          <Route path="/match/:id" element={<MatchView />} />
        </Routes>
      </main>
      <footer className="text-center py-4 text-gray-600 text-xs border-t border-piu-border/50">
        Shinsa PIU Tournament System v1.0
      </footer>
    </div>
  );
}
