import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getCommunities } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { extractCommunityPalette } from '../utils/communityColors';
import CommunityShowcaseCard from '../components/CommunityShowcaseCard';

export default function CommunitiesListPage() {
  const { user } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [communityPalettes, setCommunityPalettes] = useState({});

  useEffect(() => {
    getCommunities(search ? { q: search } : {})
      .then(setCommunities)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const missing = communities.filter((community) => community.avatar && !communityPalettes[community.id]);
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
  }, [communities, communityPalettes]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl tracking-wider">COMMUNITIES</h1>
        {user && (
          <Link
            to="/community/new"
            className="px-4 py-2 bg-gradient-to-r from-piu-accent to-purple-600 rounded-lg font-display font-bold text-sm hover:opacity-90 transition-opacity"
          >
            + Create
          </Link>
        )}
      </div>

      <div className="relative mb-6">
        <input
          type="text"
          className="w-full bg-piu-dark border border-piu-border rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-piu-accent"
          placeholder="Search communities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : communities.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 font-display">No communities found</p>
          {user && <p className="text-gray-600 text-sm mt-1">Be the first to create one!</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {communities.map(c => {
            const cardPalette = communityPalettes[c.id];
            return (
              <CommunityShowcaseCard
                key={c.id}
                community={c}
                palette={cardPalette}
                className="h-full"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
