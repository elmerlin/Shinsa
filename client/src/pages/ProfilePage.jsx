import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserProfile, getUserStats, getJacketMap,
  getPiugameSyncStatus, getPiugamePumbility, getPiugameBestScores, getPiugameRecentlyPlayed,
  syncPumbility, syncRecentlyPlayed, syncBestScores, getSyncProgress,
  followUser, unfollowUser, getFollowStatus, getSocialCounts,
  getUserPosts,
} from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag, getSkillColor, GENDER_SYMBOLS } from '../components/PlayerRegistration';
import PostCard from '../components/PostCard';

function getAge(dateStr) {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function getRank(score) {
  const s = parseInt(score) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function getGradeColor(grade) {
  const g = (grade || '').replace('+', '_p').toUpperCase();
  if (g.includes('SSS')) return 'text-sky-300';
  if (g.includes('SS')) return 'text-piu-gold';
  if (g.includes('S')) return 'text-amber-400';
  if (g.includes('AAA')) return 'text-piu-silver';
  if (g.includes('AA')) return 'text-piu-bronze';
  if (g.includes('A')) return 'text-amber-700';
  return 'text-gray-500';
}

// Rank ranges for distribution chart — ordered from best to worst
const RANK_RANGES = [
  { label: 'SSS+', min: 995000, bg: 'bg-sky-300' },
  { label: 'SSS',  min: 990000, bg: 'bg-sky-400' },
  { label: 'SS+',  min: 985000, bg: 'bg-yellow-300' },
  { label: 'SS',   min: 980000, bg: 'bg-yellow-400' },
  { label: 'S+',   min: 975000, bg: 'bg-amber-400' },
  { label: 'S',    min: 970000, bg: 'bg-amber-500' },
  { label: 'AAA+', min: 960000, bg: 'bg-slate-300' },
  { label: 'AAA',  min: 950000, bg: 'bg-slate-400' },
  { label: 'AA+',  min: 925000, bg: 'bg-violet-400' },
  { label: 'AA',   min: 900000, bg: 'bg-violet-500' },
  { label: 'A+',   min: 825000, bg: 'bg-emerald-400' },
  { label: 'A',    min: 750000, bg: 'bg-emerald-500' },
  { label: 'B',    min: 650000, bg: 'bg-gray-400' },
  { label: 'C',    min: 550000, bg: 'bg-gray-500' },
  { label: 'D',    min: 450000, bg: 'bg-gray-600' },
  { label: 'F',    min: 0,      bg: 'bg-gray-700' },
];

function getRankIndex(score) {
  for (let i = 0; i < RANK_RANGES.length; i++) {
    if (score >= RANK_RANGES[i].min) return i;
  }
  return RANK_RANGES.length - 1;
}

// Reusable song jacket with level badge overlay
function PiuSongJacket({ title, mode, level, bgUrl, jacketLookup, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  const badgeSize = size === 'sm' ? 'text-[8px] min-w-[16px] h-[14px]' : 'text-[9px] min-w-[18px] h-[16px]';
  const isSingle = mode === 'Single';
  const isDouble = mode === 'Double';

  const norm = (title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const exactKey = `${norm}|${mode}|${level}`;
  // Prefer local jacket from lookup; only use bgUrl if it's a local path (not piugame)
  const localJacket = jacketLookup[exactKey] || jacketLookup[norm] || '';
  const jacketUrl = localJacket || (bgUrl && !bgUrl.includes('piugame') ? bgUrl : '') || '';

  const badgeColor = isSingle ? 'bg-red-600' : isDouble ? 'bg-green-600' : 'bg-blue-600';

  return (
    <div className="relative shrink-0">
      {jacketUrl ? (
        <img src={jacketUrl} alt="" className={`${sizeClass} rounded object-cover`} />
      ) : (
        <div className={`${sizeClass} rounded bg-piu-dark flex items-center justify-center font-display font-bold text-sm text-gray-500`}>
          {(title || '?')[0]}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 ${badgeSize} flex items-center justify-center rounded font-display font-bold text-white leading-none ${badgeColor}`}>
        {level}
      </span>
    </div>
  );
}

// Grade distribution bar chart for a single level — grades on x-axis
// showModeFilter: only show when top-level tab is "All"
function GradeDistributionChart({ scores, rankRanges, showModeFilter = false }) {
  const [chartMode, setChartMode] = useState('');

  const filtered = chartMode ? scores.filter(s => s.mode === chartMode) : scores;

  // Build distribution, grouping B and below into one bucket
  const groupedRanges = [
    ...rankRanges.filter(r => ['SSS+','SSS','SS+','SS','S+','S','AAA+','AAA','AA+','AA','A+','A'].includes(r.label)),
    { label: 'B-', min: 0, bg: 'bg-gray-400' },
  ];
  const distribution = groupedRanges.map(r => ({ ...r, count: 0 }));
  for (const s of filtered) {
    let placed = false;
    for (let i = 0; i < rankRanges.length; i++) {
      if (s.score >= rankRanges[i].min) {
        // Is this rank in the non-grouped set (A and above)?
        const grpIdx = distribution.findIndex(d => d.label === rankRanges[i].label);
        if (grpIdx !== -1) {
          distribution[grpIdx].count++;
        } else {
          // B, C, D, F — goes into the grouped "B-" bucket
          distribution[distribution.length - 1].count++;
        }
        placed = true;
        break;
      }
    }
    if (!placed) distribution[distribution.length - 1].count++;
  }

  // Invert: lowest grade on left, SSS+ on right
  const displayDistribution = [...distribution].reverse();

  const maxCount = Math.max(1, ...displayDistribution.map(d => d.count));
  const totalCount = displayDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-gray-500 font-display">GRADE DISTRIBUTION ({totalCount} scores)</span>
        {showModeFilter && (
          <div className="flex gap-1">
            {[
              { key: '', label: 'All' },
              { key: 'Single', label: 'Singles' },
              { key: 'Double', label: 'Doubles' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setChartMode(m.key)}
                className={`px-2 py-1 rounded text-[10px] font-display font-bold transition-colors ${
                  chartMode === m.key ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-end gap-1" style={{ minHeight: '100px' }}>
        {displayDistribution.map((d, i) => (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className={`w-full rounded-t ${d.bg} transition-all`}
              style={{ height: `${d.count > 0 ? Math.max((d.count / maxCount) * 90, 4) : 0}px` }}
              title={`${d.label}: ${d.count}`}
            />
            {d.count > 0 && (
              <span className="text-[8px] font-mono text-gray-400 mt-0.5">{d.count}</span>
            )}
            <span className="text-[7px] font-display font-bold text-gray-500 leading-tight mt-0.5 truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Vertical distribution bar chart — levels on x-axis, stacked grade segments
function VerticalDistributionChart({ levels, maxCount, activeLevel, onLevelClick }) {
  if (levels.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-0.5 min-w-0" style={{ minHeight: '140px' }}>
        {levels.map(({ level, distribution, total }) => (
          <button
            key={level}
            onClick={() => onLevelClick(level)}
            className={`flex flex-col items-center flex-1 min-w-[22px] group transition-colors rounded-t ${activeLevel === String(level) ? 'bg-piu-dark/80' : 'hover:bg-piu-dark/40'}`}
          >
            {/* Stacked vertical bar */}
            <div className="w-full flex flex-col-reverse rounded-t overflow-hidden bg-piu-dark/30" style={{ height: `${Math.max((total / maxCount) * 120, 4)}px` }}>
              {distribution.map((d, i) => d.count > 0 ? (
                <div
                  key={i}
                  className={`w-full ${d.bg} relative`}
                  style={{ height: `${(d.count / total) * 100}%` }}
                  title={`${d.label}: ${d.count}`}
                />
              ) : null)}
            </div>
            {/* Count */}
            <span className="text-[8px] font-mono text-gray-500 mt-0.5">{total}</span>
            {/* Level label */}
            <span className="text-[9px] font-display font-bold text-gray-400 leading-tight">{level}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Sync progress bar component
function SyncProgressBar({ progress, total, label }) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  return (
    <div className="card py-3 px-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-display font-bold text-piu-accent">{label}</span>
        <span className="text-xs font-mono text-gray-400">{progress}/{total} pages ({pct}%)</span>
      </div>
      <div className="h-2 bg-piu-dark rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-piu-accent to-purple-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { id } = useParams();
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('overview');

  // PIUGame state
  const [piuStatus, setPiuStatus] = useState(null);
  const [piuPumbility, setPiuPumbility] = useState(null);
  const [piuBestScores, setPiuBestScores] = useState(null);
  const [piuRecentlyPlayed, setPiuRecentlyPlayed] = useState(null);
  const [piuScoreMode, setPiuScoreMode] = useState('');  // '' = All
  const [piuScoreLevel, setPiuScoreLevel] = useState('');
  const [piuSyncing, setPiuSyncing] = useState('');
  const [piuDataLoaded, setPiuDataLoaded] = useState(false);
  const [selectedPlay, setSelectedPlay] = useState(null);
  const [jacketLookup, setJacketLookup] = useState({});
  const [bestScoreSort, setBestScoreSort] = useState('score'); // 'score' | 'name'
  const [bestScoreSearch, setBestScoreSearch] = useState('');
  const [syncProgress, setSyncProgress] = useState({ in_progress: '', progress: 0, total: 0 });
  const [profilePosts, setProfilePosts] = useState([]);

  // Social state
  const [followStatus, setFollowStatus] = useState({ following: false, followers_count: 0, following_count: 0 });
  const [socialCounts, setSocialCounts] = useState({ followers_count: 0, following_count: 0, posts_count: 0 });
  const [followLoading, setFollowLoading] = useState(false);

  const isOwner = authUser && authUser.id === id;
  const hasPiuData = piuStatus && (piuStatus.linked || piuStatus.best_scores_imported || piuStatus.pumbility_value > 0);

  useEffect(() => {
    getUserProfile(id).then(setProfile).catch(() => {});
    getUserStats(id).then(setStats).catch(() => {});
    getPiugameSyncStatus(id).then(setPiuStatus).catch(() => {});
    getSocialCounts(id).then(setSocialCounts).catch(() => {});
    if (authUser) {
      getFollowStatus(id).then(setFollowStatus).catch(() => {});
    }
  }, [id, authUser]);

  // Load posts when posts tab is active
  useEffect(() => {
    if (tab === 'posts') {
      getUserPosts(id, 1).then(setProfilePosts).catch(() => {});
    }
  }, [tab, id]);

  // Load PIUGame data + jacket lookup when any PIU tab is active
  const piuTabs = ['pumbility', 'best-scores', 'recently-played'];
  const isPiuTab = piuTabs.includes(tab);

  useEffect(() => {
    if (isPiuTab && !piuDataLoaded) {
      setPiuDataLoaded(true);
      getPiugamePumbility(id).then(setPiuPumbility).catch(() => {});
      getPiugameBestScores(id).then(setPiuBestScores).catch(() => {});
      getPiugameRecentlyPlayed(id).then(setPiuRecentlyPlayed).catch(() => {});
      getJacketMap().then(map => setJacketLookup(map)).catch(() => {});
    }
  }, [isPiuTab, id, piuDataLoaded]);

  // Auto-sync pumbility + recently played (NOT best scores) for profile owner
  useEffect(() => {
    if (isPiuTab && isOwner && piuStatus?.linked && piuSyncing !== 'auto') {
      setPiuSyncing('auto');
      Promise.all([
        syncPumbility().catch(() => null),
        syncRecentlyPlayed().catch(() => null),
      ]).then(() => {
        getPiugamePumbility(id).then(setPiuPumbility).catch(() => {});
        getPiugameRecentlyPlayed(id).then(setPiuRecentlyPlayed).catch(() => {});
        getPiugameBestScores(id).then(setPiuBestScores).catch(() => {});
        getPiugameSyncStatus(id).then(setPiuStatus).catch(() => {});
      }).finally(() => setPiuSyncing(''));
    }
  }, [isPiuTab, isOwner, piuStatus?.linked]);

  // Poll sync progress when a background sync is running
  useEffect(() => {
    if (!isOwner || !piuStatus?.sync_in_progress) return;
    setSyncProgress({ in_progress: piuStatus.sync_in_progress, progress: piuStatus.sync_progress || 0, total: piuStatus.sync_total || 0 });

    const interval = setInterval(() => {
      getSyncProgress().then(data => {
        setSyncProgress(data);
        if (!data.in_progress) {
          clearInterval(interval);
          // Refresh data after sync completes
          getPiugameBestScores(id).then(setPiuBestScores).catch(() => {});
          getPiugameSyncStatus(id).then(setPiuStatus).catch(() => {});
        }
      }).catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [isOwner, piuStatus?.sync_in_progress]);

  const handleFollow = async () => {
    if (!authUser || followLoading) return;
    setFollowLoading(true);
    try {
      if (followStatus.following) {
        await unfollowUser(id);
        setFollowStatus(s => ({ ...s, following: false, followers_count: s.followers_count - 1 }));
        setSocialCounts(c => ({ ...c, followers_count: Math.max(0, c.followers_count - 1) }));
      } else {
        await followUser(id);
        setFollowStatus(s => ({ ...s, following: true, followers_count: s.followers_count + 1 }));
        setSocialCounts(c => ({ ...c, followers_count: c.followers_count + 1 }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFollowLoading(false);
    }
  };

  const [syncFeedback, setSyncFeedback] = useState('');
  const handleStartBestScoresSync = async () => {
    try {
      await syncBestScores();
      setSyncFeedback('Import started successfully. Check progress in Best Scores tab.');
      setTimeout(() => setSyncFeedback(''), 6000);
      // Refresh status to start polling
      getPiugameSyncStatus(id).then(setPiuStatus).catch(() => {});
    } catch (err) {
      alert(err.message);
    }
  };

  // Aggregate all song scores across duels and tournaments
  const songScores = useMemo(() => {
    if (!stats) return [];
    const scores = [];

    for (const { duel, songs } of stats.duelStats) {
      const isP1 = duel.player1_user_id === id;
      for (const s of songs) {
        const myScore = isP1 ? s.player1_score : s.player2_score;
        const opponentScore = isP1 ? s.player2_score : s.player1_score;
        const won = (isP1 && s.winner === 'player1') || (!isP1 && s.winner === 'player2');
        if (myScore > 0 || opponentScore > 0) {
          scores.push({
            title: s.song_title, artist: s.song_artist, mode: s.song_mode, level: s.song_level,
            jacket: s.song_jacket_url, myScore, opponentScore, won,
            draw: s.winner === 'draw', source: `Duel: ${duel.name}`, date: duel.date || duel.created_at,
          });
        }
      }
    }

    for (const { tournament, matches } of stats.tournamentPlayers) {
      for (const m of matches) {
        if (m.status !== 'COMPLETED') continue;
        const isP1 = m.player1_id === tournament.id;
        const playedSongs = JSON.parse(m.played_songs || '[]');
        const matchScores = JSON.parse(m.scores || '{}');
        for (const ps of playedSongs) {
          const myScore = isP1 ? (matchScores[ps.id]?.player1 || 0) : (matchScores[ps.id]?.player2 || 0);
          const oppScore = isP1 ? (matchScores[ps.id]?.player2 || 0) : (matchScores[ps.id]?.player1 || 0);
          if (myScore > 0 || oppScore > 0) {
            scores.push({
              title: ps.title, artist: ps.artist || '', mode: ps.mode, level: ps.level,
              jacket: ps.jacket_url || '', myScore, opponentScore: oppScore,
              won: myScore > oppScore, draw: myScore === oppScore,
              source: `Tournament: ${tournament.tournament_name}`, date: tournament.tournament_date || '',
            });
          }
        }
      }
    }

    return scores.sort((a, b) => b.myScore - a.myScore);
  }, [stats, id]);

  // Aggregated stats
  const aggregated = useMemo(() => {
    if (!stats) return null;
    const tournamentCount = stats.tournamentPlayers.length;
    const duelCount = stats.duelStats.length;
    let totalWins = 0, totalLosses = 0;
    for (const { tournament } of stats.tournamentPlayers) {
      totalWins += tournament.wins || 0;
      totalLosses += tournament.losses || 0;
    }
    let duelWins = 0, duelLosses = 0;
    for (const { duel } of stats.duelStats) {
      if (duel.status !== 'COMPLETED') continue;
      const isP1 = duel.player1_user_id === id;
      if ((isP1 && duel.winner === 'player1') || (!isP1 && duel.winner === 'player2')) duelWins++;
      else if (duel.winner !== 'draw') duelLosses++;
    }
    const totalSongs = songScores.length;
    const avgScore = totalSongs > 0 ? Math.round(songScores.reduce((s, sc) => s + sc.myScore, 0) / totalSongs) : 0;
    const bestScore = totalSongs > 0 ? Math.max(...songScores.map(s => s.myScore)) : 0;

    const levelMap = {};
    songScores.forEach(s => {
      if (!levelMap[s.level]) levelMap[s.level] = { count: 0, totalScore: 0 };
      levelMap[s.level].count++;
      levelMap[s.level].totalScore += s.myScore;
    });
    const byLevel = Object.entries(levelMap)
      .map(([level, d]) => ({ level: parseInt(level), count: d.count, avg: Math.round(d.totalScore / d.count) }))
      .sort((a, b) => a.level - b.level);

    return { tournamentCount, duelCount, totalWins, totalLosses, duelWins, duelLosses, totalSongs, avgScore, bestScore, byLevel };
  }, [stats, songScores, id]);

  // Filtered + sorted best scores
  const filteredBestScores = useMemo(() => {
    if (!piuBestScores?.scores) return [];
    let filtered = piuBestScores.scores;
    if (piuScoreMode) {
      filtered = filtered.filter(s => s.mode === piuScoreMode);
    }
    if (piuScoreLevel) {
      filtered = filtered.filter(s => s.level === parseInt(piuScoreLevel));
    }
    if (bestScoreSearch) {
      const q = bestScoreSearch.toLowerCase();
      filtered = filtered.filter(s => s.song_title.toLowerCase().includes(q));
    }
    if (bestScoreSort === 'name') {
      filtered = [...filtered].sort((a, b) => a.song_title.localeCompare(b.song_title));
    } else {
      filtered = [...filtered].sort((a, b) => b.score - a.score);
    }
    return filtered;
  }, [piuBestScores, piuScoreMode, piuScoreLevel, bestScoreSort, bestScoreSearch]);

  // Available levels for filtering
  const availableLevels = useMemo(() => {
    if (!piuBestScores?.scores) return [];
    const levels = new Set();
    const modeFiltered = piuScoreMode ? piuBestScores.scores.filter(s => s.mode === piuScoreMode) : piuBestScores.scores;
    modeFiltered.forEach(s => levels.add(s.level));
    return [...levels].sort((a, b) => a - b);
  }, [piuBestScores, piuScoreMode]);

  // Level distribution data for chart
  const levelDistribution = useMemo(() => {
    if (!piuBestScores?.scores) return { levels: [], maxCount: 0 };
    const modeFiltered = piuScoreMode ? piuBestScores.scores.filter(s => s.mode === piuScoreMode) : piuBestScores.scores;

    const levelMap = {};
    let maxCount = 0;
    for (const s of modeFiltered) {
      if (!levelMap[s.level]) {
        levelMap[s.level] = RANK_RANGES.map(r => ({ ...r, count: 0 }));
      }
      const idx = getRankIndex(s.score);
      levelMap[s.level][idx].count++;
    }

    const levels = Object.entries(levelMap)
      .map(([level, distribution]) => {
        const total = distribution.reduce((s, d) => s + d.count, 0);
        if (total > maxCount) maxCount = total;
        return { level: parseInt(level), distribution, total };
      })
      .sort((a, b) => a.level - b.level);

    return { levels, maxCount };
  }, [piuBestScores, piuScoreMode]);

  if (!profile) {
    return <div className="text-center py-20 text-gray-500">Loading profile...</div>;
  }

  const age = profile.show_age && profile.date_of_birth ? getAge(profile.date_of_birth) : null;
  const genderSymbol = profile.gender ? GENDER_SYMBOLS[profile.gender] || '' : '';
  const flag = getCountryFlag(profile.nationality);

  const tabs = ['overview', 'posts', 'tournaments', 'duels', 'songs'];
  if (hasPiuData) {
    tabs.push('pumbility', 'best-scores', 'recently-played');
  }

  const tabLabels = {
    overview: 'Overview', tournaments: 'Tournaments', duels: 'Duels', songs: 'Songs', posts: 'Posts',
    pumbility: 'Pumbility', 'best-scores': 'Best Scores', 'recently-played': 'Recently Played',
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="card flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6">
        {profile.avatar ? (
          <img src={getAvatarUrl(profile.avatar)} alt="" className="w-24 h-24 rounded-full object-cover border-2 border-piu-border shadow-lg" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-3xl shadow-lg">
            {profile.username[0].toUpperCase()}
          </div>
        )}
        <div className="text-center sm:text-left flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            {flag && <span className="text-xl">{flag}</span>}
            <h1 className="text-2xl font-display font-bold">{profile.username}</h1>
            {genderSymbol && (
              <span className={`text-lg ${profile.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                {genderSymbol}
              </span>
            )}
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-2 mt-1 flex-wrap">
            {profile.skill_title && (
              <span className={`badge border ${getSkillColor(profile.skill_title)}`}>
                {profile.skill_title}
              </span>
            )}
            {profile.pumbility > 0 && (
              <span className="text-sm text-piu-gold font-mono font-bold">{profile.pumbility.toLocaleString()} PB</span>
            )}
            {age !== null && (
              <span className="text-sm text-gray-500">Age {age}</span>
            )}
          </div>
          {profile.description && (
            <p className="text-sm text-gray-400 mt-2">{profile.description}</p>
          )}
          <p className="text-xs text-gray-600 mt-1">
            Member since {new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
          </p>
          {/* Follow button */}
          {authUser && !isOwner && (
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className={`mt-2 px-4 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
                followStatus.following
                  ? 'bg-piu-dark text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-piu-border'
                  : 'bg-piu-accent text-white hover:bg-piu-accent/80'
              }`}
            >
              {followLoading ? '...' : followStatus.following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      {aggregated && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl text-piu-accent">{socialCounts.followers_count}</p>
            <p className="text-[10px] text-gray-500 font-display">Followers</p>
          </div>
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl text-piu-accent">{socialCounts.posts_count}</p>
            <p className="text-[10px] text-gray-500 font-display">Posts</p>
          </div>
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl text-piu-accent">{aggregated.duelCount}</p>
            <p className="text-[10px] text-gray-500 font-display">Duels</p>
          </div>
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl text-piu-accent">{aggregated.tournamentCount}</p>
            <p className="text-[10px] text-gray-500 font-display">Tournaments</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Syncing indicator */}
      {piuSyncing === 'auto' && isPiuTab && (
        <div className="text-center text-xs text-piu-accent animate-pulse py-2 mb-2">
          Syncing latest data from piugame.com...
        </div>
      )}

      {/* Background sync progress bar */}
      {syncProgress.in_progress && (
        <div className="mb-4">
          <SyncProgressBar
            progress={syncProgress.progress}
            total={syncProgress.total}
            label="Importing Best Scores..."
          />
        </div>
      )}

      {/* Tab Content */}
      {tab === 'overview' && aggregated && (
        <div className="space-y-4">
          {aggregated.byLevel.length > 0 && (
            <div className="card">
              <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Average Score by Level</h3>
              <div className="space-y-1.5">
                {aggregated.byLevel.map(l => {
                  const rank = getRank(l.avg);
                  return (
                    <div key={l.level} className="flex items-center gap-2">
                      <span className="text-xs font-display font-bold w-10 text-gray-400">Lv.{l.level}</span>
                      <div className="flex-1 h-4 bg-piu-dark rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-piu-accent to-purple-600 rounded-full"
                          style={{ width: `${(l.avg / 1000000) * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs font-display font-bold w-8 ${rank.color}`}>{rank.label}</span>
                      <span className="text-xs font-mono text-gray-500 w-16 text-right">{l.avg.toLocaleString()}</span>
                      <span className="text-[10px] text-gray-600 w-8 text-right">{l.count}x</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {songScores.length > 0 && (
            <div className="card">
              <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Top Scores</h3>
              <div className="space-y-2">
                {songScores.slice(0, 10).map((s, i) => {
                  const rank = getRank(s.myScore);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 font-mono w-4">#{i + 1}</span>
                      {s.jacket && (
                        <img src={s.jacket} alt="" className="w-8 h-8 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold truncate">{s.title}</p>
                        <p className="text-[10px] text-gray-500">
                          {s.mode} Lv.{s.level}
                          <span className="ml-2 text-gray-600">{s.source}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`font-display font-bold text-xs ${rank.color}`}>{rank.label}</span>
                        <p className="font-mono text-xs font-bold">{s.myScore.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'tournaments' && stats && (
        <div className="space-y-3">
          {stats.tournamentPlayers.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No tournament participation yet</p>
          ) : (
            stats.tournamentPlayers.map(({ tournament, matches }) => (
              <Link
                key={tournament.tournament_id || tournament.id}
                to={`/tournament/${tournament.tournament_id}`}
                className="card-hover flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  {tournament.tournament_avatar ? (
                    <img src={getAvatarUrl(tournament.tournament_avatar)} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-piu-accent to-purple-700 rounded-lg flex items-center justify-center font-display font-bold">
                      {(tournament.tournament_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-display font-bold group-hover:text-piu-accent transition-colors">
                      {tournament.tournament_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tournament.tournament_date || ''} - {tournament.wins}W {tournament.losses}L
                    </p>
                  </div>
                </div>
                <span className={`badge ${
                  tournament.tournament_phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
                }`}>
                  {tournament.tournament_phase}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'duels' && stats && (
        <div className="space-y-3">
          {stats.duelStats.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No duel participation yet</p>
          ) : (
            stats.duelStats.map(({ duel, songs }) => {
              const isP1 = duel.player1_user_id === id;
              const opponentName = isP1 ? duel.player2_name : duel.player1_name;
              const myWins = songs.filter(s => (isP1 && s.winner === 'player1') || (!isP1 && s.winner === 'player2')).length;
              const oppWins = songs.filter(s => (isP1 && s.winner === 'player2') || (!isP1 && s.winner === 'player1')).length;
              return (
                <Link key={duel.id} to={`/duel/${duel.id}`} className="card-hover flex items-center justify-between group">
                  <div>
                    <p className="font-display font-bold group-hover:text-piu-accent transition-colors">
                      {duel.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      vs {opponentName} - {myWins}W {oppWins}L ({songs.length} songs)
                    </p>
                  </div>
                  <span className={`badge ${duel.status === 'COMPLETED' ? 'badge-completed' : 'badge-active'}`}>
                    {duel.status === 'COMPLETED' ? 'Completed' : 'Active'}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      )}

      {tab === 'songs' && (
        <div className="space-y-2">
          {songScores.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No song scores recorded yet</p>
          ) : (
            songScores.map((s, i) => {
              const rank = getRank(s.myScore);
              return (
                <div key={i} className="card flex items-center gap-3 py-2">
                  {s.jacket && (
                    <img src={s.jacket} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-bold truncate">{s.title}</p>
                    <p className="text-[10px] text-gray-500">
                      {s.mode} Lv.{s.level} - {s.source}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`font-display font-bold text-xs ${rank.color}`}>{rank.label}</span>
                    <p className="font-mono text-xs font-bold">{s.myScore.toLocaleString()}</p>
                  </div>
                  <div className="w-6 text-center shrink-0">
                    {s.won && <span className="text-piu-green text-xs">W</span>}
                    {!s.won && !s.draw && <span className="text-red-400 text-xs">L</span>}
                    {s.draw && <span className="text-gray-500 text-xs">D</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ────── POSTS TAB ────── */}
      {tab === 'posts' && (
        <div className="space-y-3">
          {profilePosts.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No posts yet</p>
          ) : (
            profilePosts.map(post => (
              <PostCard
                key={post.id}
                post={{ ...post, username: profile.username, avatar: profile.avatar, nationality: profile.nationality }}
                showAuthor={false}
              />
            ))
          )}
        </div>
      )}

      {/* ────── PUMBILITY TAB ────── */}
      {tab === 'pumbility' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-base text-piu-accent">PUMBILITY</h3>
            {piuPumbility?.pumbility_value > 0 && (
              <span className="text-2xl font-mono font-bold text-piu-gold">
                {piuPumbility.pumbility_value.toLocaleString()}
              </span>
            )}
          </div>

          {piuPumbility?.scores?.length > 0 ? (
            <div className="space-y-2">
              {piuPumbility.scores.map((s, i) => {
                const rank = getRank(s.score);
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/30 last:border-0">
                    <span className="text-xs text-gray-500 font-mono w-6 shrink-0 text-right">#{s.rank_order}</span>
                    <PiuSongJacket
                      title={s.song_title} mode={s.mode} level={s.level}
                      bgUrl={s.background_url} jacketLookup={jacketLookup}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-bold truncate">{s.song_title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-display font-bold ${s.grade ? getGradeColor(s.grade) : rank.color}`}>
                        {s.grade || rank.label}
                      </span>
                      <p className="font-mono text-xs font-bold">{s.score.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-500 text-sm py-6">No pumbility data synced yet</p>
          )}

          {piuPumbility?.last_sync && (
            <p className="text-xs text-gray-600 mt-4">
              Last synced: {new Date(piuPumbility.last_sync + 'Z').toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* ────── BEST SCORES TAB ────── */}
      {tab === 'best-scores' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-base text-piu-accent">BEST SCORES</h3>
              {isOwner && piuStatus?.linked && !syncProgress.in_progress && (
                <button
                  onClick={handleStartBestScoresSync}
                  className="text-xs text-gray-400 hover:text-piu-accent transition-colors font-display"
                >
                  Full Sync
                </button>
              )}
            </div>

            {syncFeedback && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-display">
                {syncFeedback}
              </div>
            )}

            {/* Mode filter: All, Single, Double, Co-op */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="flex gap-1">
                {[
                  { key: '', label: 'All' },
                  { key: 'Single', label: 'Single' },
                  { key: 'Double', label: 'Double' },
                  { key: 'Co-op', label: 'Co-op' },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setPiuScoreMode(m.key); setPiuScoreLevel(''); }}
                    className={`px-3 py-1.5 rounded text-xs font-display font-bold transition-colors ${
                      piuScoreMode === m.key ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Level filter */}
              {availableLevels.length > 0 && (
                <select
                  className="input-field text-xs py-1.5 px-2 w-auto"
                  value={piuScoreLevel}
                  onChange={e => setPiuScoreLevel(e.target.value)}
                >
                  <option value="">All Levels ({(piuScoreMode ? piuBestScores?.scores?.filter(s => s.mode === piuScoreMode) : piuBestScores?.scores)?.length || 0})</option>
                  {availableLevels.map(l => {
                    const count = (piuScoreMode ? piuBestScores?.scores?.filter(s => s.mode === piuScoreMode && s.level === l) : piuBestScores?.scores?.filter(s => s.level === l))?.length || 0;
                    return <option key={l} value={l}>Lv.{l} ({count})</option>;
                  })}
                </select>
              )}
            </div>

            {/* Distribution chart — vertical bars with levels on x-axis */}
            {levelDistribution.levels.length > 0 && !piuScoreLevel && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-500 font-display">SCORE DISTRIBUTION BY LEVEL</span>
                  {/* Legend */}
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {RANK_RANGES.filter((_, i) => i < 8).map(r => (
                      <div key={r.label} className="flex items-center gap-0.5">
                        <div className={`w-2 h-2 rounded-sm ${r.bg}`} />
                        <span className="text-[8px] text-gray-500">{r.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <VerticalDistributionChart
                  levels={levelDistribution.levels}
                  maxCount={levelDistribution.maxCount}
                  activeLevel={piuScoreLevel}
                  onLevelClick={(level) => setPiuScoreLevel(piuScoreLevel === String(level) ? '' : String(level))}
                />
              </div>
            )}

            {/* Grade distribution chart for selected level */}
            {piuScoreLevel && piuBestScores?.scores && (
              <GradeDistributionChart
                scores={piuBestScores.scores.filter(s => s.level === parseInt(piuScoreLevel))}
                rankRanges={RANK_RANGES}
                showModeFilter={piuScoreMode === ''}
              />
            )}

            {/* Search + Sort */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                className="input-field text-xs py-1.5 flex-1"
                placeholder="Search songs..."
                value={bestScoreSearch}
                onChange={e => setBestScoreSearch(e.target.value)}
              />
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setBestScoreSort('score')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-display font-bold transition-colors ${
                    bestScoreSort === 'score' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                  }`}
                >
                  Score
                </button>
                <button
                  onClick={() => setBestScoreSort('name')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-display font-bold transition-colors ${
                    bestScoreSort === 'name' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                  }`}
                >
                  Name
                </button>
              </div>
            </div>

            {/* Song list */}
            {filteredBestScores.length > 0 ? (
              <div className="space-y-1.5">
                {filteredBestScores.map((s, i) => {
                  const rank = getRank(s.score);
                  return (
                    <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/30 last:border-0">
                      <PiuSongJacket
                        title={s.song_title} mode={s.mode} level={s.level}
                        bgUrl={s.background_url || ''} jacketLookup={jacketLookup}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold truncate">{s.song_title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] px-1 py-0.5 rounded font-display font-bold ${
                            s.mode === 'Single' ? 'bg-red-600/20 text-red-400' :
                            s.mode === 'Double' ? 'bg-green-600/20 text-green-400' :
                            'bg-blue-600/20 text-blue-400'
                          }`}>
                            {s.mode === 'Single' ? 'S' : s.mode === 'Double' ? 'D' : 'C'}{s.level}
                          </span>
                          {s.plate && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-piu-dark text-gray-400 font-mono">{s.plate}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-display font-bold ${s.grade ? getGradeColor(s.grade) : rank.color}`}>
                          {s.grade || rank.label}
                        </span>
                        <p className="font-mono text-xs font-bold">{s.score.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 text-sm py-6">
                {piuBestScores?.scores?.length > 0
                  ? `No scores found${bestScoreSearch ? ` matching "${bestScoreSearch}"` : ''}`
                  : 'No best scores imported yet'}
              </p>
            )}

            {piuBestScores?.last_sync && (
              <p className="text-xs text-gray-600 mt-4">
                Last synced: {new Date(piuBestScores.last_sync + 'Z').toLocaleString()}
                {piuBestScores?.scores && ` | ${piuBestScores.scores.length} total scores`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ────── RECENTLY PLAYED TAB ────── */}
      {tab === 'recently-played' && (
        <div className="card">
          <h3 className="font-display font-bold text-base text-piu-accent mb-4">RECENTLY PLAYED</h3>

          {piuRecentlyPlayed?.plays?.length > 0 ? (
            <div className="space-y-2">
              {piuRecentlyPlayed.plays.map((p, i) => {
                const rank = getRank(p.score);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2 border-b border-piu-border/30 last:border-0 cursor-pointer hover:bg-piu-dark/50 rounded transition-colors"
                    onClick={() => setSelectedPlay(p)}
                  >
                    <PiuSongJacket
                      title={p.song_title} mode={p.mode} level={p.level}
                      bgUrl={p.background_url} jacketLookup={jacketLookup}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-bold truncate">{p.song_title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {p.score > 0 ? (
                        <>
                          <span className={`text-xs font-display font-bold ${p.grade ? getGradeColor(p.grade) : rank.color}`}>
                            {p.grade || rank.label}
                          </span>
                          <p className="font-mono text-xs font-bold">{p.score.toLocaleString()}</p>
                        </>
                      ) : (
                        <span className="text-xs font-display font-bold text-red-500">STAGE BREAK</span>
                      )}
                    </div>
                    {p.date_played && (
                      <span className="text-[10px] text-gray-500 shrink-0 w-16 text-right">
                        {p.date_played.split(' ')[0]?.replace(/^\d{4}-/, '')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-500 text-sm py-6">No recently played data synced yet</p>
          )}

          {piuRecentlyPlayed?.last_sync && (
            <p className="text-xs text-gray-600 mt-4">
              Last synced: {new Date(piuRecentlyPlayed.last_sync + 'Z').toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Phoenix Score Card Modal */}
      {selectedPlay && (() => {
        const p = selectedPlay;
        const rank = getRank(p.score);
        const hasBreakdown = p.perfect > 0 || p.great > 0 || p.good > 0 || p.bad > 0 || p.miss > 0;
        const PLATE_NAMES = { PG: 'PERFECT GAME', UG: 'ULTIMATE GAME', EG: 'EXTREME GAME', SG: 'SUPERB GAME', MG: 'MARVELOUS GAME', TG: 'TALENTED GAME', FG: 'FAIR GAME', RG: 'ROUGH GAME' };
        const PLATE_COLORS = { PG: 'text-piu-gold', UG: 'text-yellow-400', EG: 'text-green-400', SG: 'text-blue-400', MG: 'text-sky-400', TG: 'text-purple-400', FG: 'text-gray-400', RG: 'text-red-400' };
        const plateName = PLATE_NAMES[p.plate] || p.plate || '';
        const plateColor = PLATE_COLORS[p.plate] || 'text-gray-400';
        const judgments = [
          { label: 'PERFECT', value: p.perfect || 0, textColor: 'text-sky-400' },
          { label: 'GREAT', value: p.great || 0, textColor: 'text-green-400' },
          { label: 'GOOD', value: p.good || 0, textColor: 'text-yellow-400' },
          { label: 'BAD', value: p.bad || 0, textColor: 'text-fuchsia-400' },
          { label: 'MISS', value: p.miss || 0, textColor: 'text-gray-400' },
        ];
        const modalNorm = (p.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const modalExactKey = `${modalNorm}|${p.mode}|${p.level}`;
        const modalBg = jacketLookup[modalExactKey] || jacketLookup[modalNorm] || '';
        return (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPlay(null)}>
            <div
              className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-piu-border shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {modalBg && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-15"
                  style={{ backgroundImage: `url(${modalBg})` }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-piu-bg/85 to-piu-bg" />

              <div className="relative p-5">
                <button
                  className="absolute top-3 right-3 text-gray-500 hover:text-white text-xl leading-none"
                  onClick={() => setSelectedPlay(null)}
                >
                  x
                </button>

                <p className="font-display font-bold text-lg leading-tight pr-6">{p.song_title}</p>

                <div className="flex items-center gap-3 mt-4">
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                    p.mode === 'Single' ? 'border-red-500/50 bg-red-500/10' : p.mode === 'Double' ? 'border-green-500/50 bg-green-500/10' : 'border-blue-500/50 bg-blue-500/10'
                  }`}>
                    <span className={`font-display font-bold text-[10px] uppercase ${p.mode === 'Single' ? 'text-red-400' : p.mode === 'Double' ? 'text-green-400' : 'text-blue-400'}`}>{p.mode}</span>
                    <span className={`font-display font-bold text-base ${p.mode === 'Single' ? 'text-red-300' : p.mode === 'Double' ? 'text-green-300' : 'text-blue-300'}`}>{p.level}</span>
                  </div>
                  <div className="text-center flex-1">
                    {p.score > 0 ? (
                      <p className={`text-3xl font-display font-black ${p.grade ? getGradeColor(p.grade) : rank.color}`}>
                        {p.grade || rank.label}
                      </p>
                    ) : (
                      <p className="text-xl font-display font-black text-red-500">STAGE BREAK</p>
                    )}
                  </div>
                </div>

                {plateName && (
                  <p className={`text-center font-display font-bold text-sm mt-1 ${plateColor}`}>{plateName}</p>
                )}

                {p.score > 0 && (
                  <p className="text-center font-mono text-2xl font-bold mt-2">{p.score.toLocaleString()}</p>
                )}

                {hasBreakdown && (
                  <div className="grid grid-cols-5 gap-1 text-center mt-5 pt-4 border-t border-piu-border/30">
                    {judgments.map(j => (
                      <div key={j.label}>
                        <p className={`text-[10px] font-display font-bold ${j.textColor}`}>{j.label}</p>
                        <p className="font-mono font-bold text-base mt-0.5">{j.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {!hasBreakdown && p.score > 0 && (
                  <p className="text-center text-xs text-gray-600 mt-4 pt-4 border-t border-piu-border/30">
                    Judgment breakdown not available — try re-syncing
                  </p>
                )}

                {p.date_played && (
                  <p className="text-xs text-gray-500 text-right mt-3">{p.date_played}</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
