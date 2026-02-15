import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserProfile, getUserStats,
  getPiugameSyncStatus, getPiugamePumbility, getPiugameBestScores, getPiugameRecentlyPlayed,
  syncPumbility, syncRecentlyPlayed,
} from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag, getSkillColor, GENDER_SYMBOLS } from '../components/PlayerRegistration';

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
  if (score >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (score >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (score >= 980000) return { label: 'SS+', color: 'text-piu-gold' };
  if (score >= 960000) return { label: 'SS', color: 'text-yellow-400' };
  if (score >= 940000) return { label: 'S+', color: 'text-amber-400' };
  if (score >= 920000) return { label: 'S', color: 'text-amber-500' };
  if (score >= 900000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (score >= 850000) return { label: 'AAA', color: 'text-gray-300' };
  if (score >= 800000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (score >= 750000) return { label: 'AA', color: 'text-piu-bronze' };
  if (score >= 700000) return { label: 'A+', color: 'text-amber-700' };
  if (score >= 650000) return { label: 'A', color: 'text-amber-700' };
  if (score >= 550000) return { label: 'B', color: 'text-gray-500' };
  if (score >= 450000) return { label: 'C', color: 'text-gray-500' };
  if (score >= 350000) return { label: 'D', color: 'text-gray-600' };
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
  const [piuScoreMode, setPiuScoreMode] = useState('Single');
  const [piuScoreLevel, setPiuScoreLevel] = useState('');
  const [piuSyncing, setPiuSyncing] = useState('');
  const [piuLoaded, setPiuLoaded] = useState(false);
  const [piuSubTab, setPiuSubTab] = useState('pumbility');
  const [selectedPlay, setSelectedPlay] = useState(null);

  useEffect(() => {
    getUserProfile(id).then(setProfile).catch(() => {});
    getUserStats(id).then(setStats).catch(() => {});
    getPiugameSyncStatus(id).then(setPiuStatus).catch(() => {});
  }, [id]);

  // Load PIUGame data when switching to the piugame tab
  useEffect(() => {
    if (tab === 'piugame' && !piuLoaded) {
      setPiuLoaded(true);
      getPiugamePumbility(id).then(setPiuPumbility).catch(() => {});
      getPiugameBestScores(id).then(setPiuBestScores).catch(() => {});
      getPiugameRecentlyPlayed(id).then(setPiuRecentlyPlayed).catch(() => {});
    }
  }, [tab, id, piuLoaded]);

  // Auto-refresh pumbility + recently played when visiting someone's profile (if they have data)
  const isOwner = authUser && authUser.id === id;
  useEffect(() => {
    if (tab === 'piugame' && isOwner && piuStatus?.linked) {
      // Auto-sync pumbility and recently played for the profile owner
      setPiuSyncing('auto');
      Promise.all([
        syncPumbility().catch(() => null),
        syncRecentlyPlayed().catch(() => null),
      ]).then(() => {
        // Refresh the displayed data
        getPiugamePumbility(id).then(setPiuPumbility).catch(() => {});
        getPiugameRecentlyPlayed(id).then(setPiuRecentlyPlayed).catch(() => {});
        getPiugameBestScores(id).then(setPiuBestScores).catch(() => {});
      }).finally(() => setPiuSyncing(''));
    }
  }, [tab, isOwner, piuStatus?.linked]);

  // Aggregate all song scores across duels and tournaments
  const songScores = useMemo(() => {
    if (!stats) return [];
    const scores = [];

    // From duels
    for (const { duel, songs } of stats.duelStats) {
      const isP1 = duel.player1_user_id === id;
      for (const s of songs) {
        const myScore = isP1 ? s.player1_score : s.player2_score;
        const opponentScore = isP1 ? s.player2_score : s.player1_score;
        const won = (isP1 && s.winner === 'player1') || (!isP1 && s.winner === 'player2');
        if (myScore > 0 || opponentScore > 0) {
          scores.push({
            title: s.song_title,
            artist: s.song_artist,
            mode: s.song_mode,
            level: s.song_level,
            jacket: s.song_jacket_url,
            myScore,
            opponentScore,
            won,
            draw: s.winner === 'draw',
            source: `Duel: ${duel.name}`,
            date: duel.date || duel.created_at,
          });
        }
      }
    }

    // From tournament matches
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
              title: ps.title,
              artist: ps.artist || '',
              mode: ps.mode,
              level: ps.level,
              jacket: ps.jacket_url || '',
              myScore,
              opponentScore: oppScore,
              won: myScore > oppScore,
              draw: myScore === oppScore,
              source: `Tournament: ${tournament.tournament_name}`,
              date: tournament.tournament_date || '',
            });
          }
        }
      }
    }

    return scores.sort((a, b) => b.myScore - a.myScore);
  }, [stats, id]);

  // Aggregate stats
  const aggregated = useMemo(() => {
    if (!stats) return null;
    const tournamentCount = stats.tournamentPlayers.length;
    const duelCount = stats.duelStats.length;
    let totalWins = 0, totalLosses = 0;
    for (const { tournament } of stats.tournamentPlayers) {
      totalWins += tournament.wins || 0;
      totalLosses += tournament.losses || 0;
    }
    // Duel wins/losses
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

    // Level distribution
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

  // Filtered best scores for PIUGame tab
  const filteredBestScores = useMemo(() => {
    if (!piuBestScores?.scores) return [];
    let filtered = piuBestScores.scores.filter(s => s.mode === piuScoreMode);
    if (piuScoreLevel) {
      filtered = filtered.filter(s => s.level === parseInt(piuScoreLevel));
    }
    return filtered;
  }, [piuBestScores, piuScoreMode, piuScoreLevel]);

  // Available levels for filtering
  const availableLevels = useMemo(() => {
    if (!piuBestScores?.scores) return [];
    const levels = new Set();
    piuBestScores.scores.filter(s => s.mode === piuScoreMode).forEach(s => levels.add(s.level));
    return [...levels].sort((a, b) => a - b);
  }, [piuBestScores, piuScoreMode]);

  if (!profile) {
    return <div className="text-center py-20 text-gray-500">Loading profile...</div>;
  }

  const age = profile.show_age && profile.date_of_birth ? getAge(profile.date_of_birth) : null;
  const genderSymbol = profile.gender ? GENDER_SYMBOLS[profile.gender] || '' : '';
  const flag = getCountryFlag(profile.nationality);
  const hasPiuData = piuStatus && (piuStatus.linked || piuStatus.best_scores_imported || piuStatus.pumbility_value > 0);

  const tabs = ['overview', 'tournaments', 'duels', 'songs'];
  if (hasPiuData) tabs.push('piugame');

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
        </div>
      </div>

      {/* Stats Summary */}
      {aggregated && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl text-piu-accent">{aggregated.tournamentCount}</p>
            <p className="text-[10px] text-gray-500 font-display">Tournaments</p>
          </div>
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl text-piu-accent">{aggregated.duelCount}</p>
            <p className="text-[10px] text-gray-500 font-display">Duels</p>
          </div>
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl text-piu-green">{aggregated.totalWins + aggregated.duelWins}W</p>
            <p className="text-[10px] text-gray-500 font-display">Total Wins</p>
          </div>
          <div className="card text-center py-3">
            <p className="font-mono font-bold text-xl">{aggregated.avgScore.toLocaleString()}</p>
            <p className="text-[10px] text-gray-500 font-display">Avg Score</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {t === 'piugame' ? 'PIUGame Data' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && aggregated && (
        <div className="space-y-4">
          {/* Level Breakdown */}
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

          {/* Best Scores */}
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

      {/* PIUGame Data Tab */}
      {tab === 'piugame' && (
        <div className="space-y-4">
          {piuSyncing === 'auto' && (
            <div className="text-center text-xs text-piu-accent animate-pulse py-2">
              Syncing latest data from piugame.com...
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'pumbility', label: 'Pumbility' },
              { key: 'best-scores', label: 'Best Scores' },
              { key: 'recently-played', label: 'Recently Played' },
            ].map(st => (
              <button
                key={st.key}
                onClick={() => setPiuSubTab(st.key)}
                className={`px-4 py-2 rounded-lg text-xs font-display font-bold transition-colors ${
                  piuSubTab === st.key ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Pumbility Sub-tab */}
          {piuSubTab === 'pumbility' && (
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
                        {s.background_url && (
                          <img src={s.background_url} alt="" className="w-11 h-11 rounded object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-display font-bold truncate">{s.song_title}</p>
                          <p className="text-xs text-gray-500">{s.mode} Lv.{s.level}</p>
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

          {/* Best Scores Sub-tab */}
          {piuSubTab === 'best-scores' && (
            <div className="card">
              <h3 className="font-display font-bold text-base text-piu-accent mb-4">BEST SCORES</h3>

              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <div className="flex gap-1">
                  {['Single', 'Double'].map(m => (
                    <button
                      key={m}
                      onClick={() => { setPiuScoreMode(m); setPiuScoreLevel(''); }}
                      className={`px-4 py-1.5 rounded text-xs font-display font-bold transition-colors ${
                        piuScoreMode === m ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {availableLevels.length > 0 && (
                  <select
                    className="input-field text-xs py-1.5 px-2 w-auto"
                    value={piuScoreLevel}
                    onChange={e => setPiuScoreLevel(e.target.value)}
                  >
                    <option value="">All Levels ({piuBestScores?.scores?.filter(s => s.mode === piuScoreMode).length || 0})</option>
                    {availableLevels.map(l => (
                      <option key={l} value={l}>
                        Lv.{l} ({piuBestScores?.scores?.filter(s => s.mode === piuScoreMode && s.level === l).length || 0})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {filteredBestScores.length > 0 ? (
                <div className="space-y-2">
                  {filteredBestScores.map((s, i) => {
                    const rank = getRank(s.score);
                    return (
                      <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/30 last:border-0">
                        <div className="w-11 h-11 rounded bg-piu-dark flex items-center justify-center shrink-0">
                          <span className="text-xs font-display font-bold text-gray-400">
                            {s.mode === 'Single' ? 'S' : 'D'}{s.level}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-display font-bold truncate">{s.song_title}</p>
                          {s.plate && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-piu-dark text-gray-400 font-mono">{s.plate}</span>
                          )}
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
                    ? `No ${piuScoreMode} scores${piuScoreLevel ? ` at Lv.${piuScoreLevel}` : ''}`
                    : 'No best scores imported yet'}
                </p>
              )}

              {piuBestScores?.last_sync && (
                <p className="text-xs text-gray-600 mt-4">
                  Last synced: {new Date(piuBestScores.last_sync + 'Z').toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Recently Played Sub-tab */}
          {piuSubTab === 'recently-played' && (
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
                        {p.background_url ? (
                          <img src={p.background_url} alt="" className="w-11 h-11 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded bg-piu-dark shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-display font-bold truncate">{p.song_title}</p>
                          <p className="text-xs text-gray-500">{p.mode} Lv.{p.level}</p>
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
            const totalNotes = (p.perfect || 0) + (p.great || 0) + (p.good || 0) + (p.bad || 0) + (p.miss || 0);
            const judgments = [
              { label: 'PERFECT', value: p.perfect || 0, color: 'bg-sky-500', textColor: 'text-sky-400' },
              { label: 'GREAT', value: p.great || 0, color: 'bg-green-500', textColor: 'text-green-400' },
              { label: 'GOOD', value: p.good || 0, color: 'bg-yellow-500', textColor: 'text-yellow-400' },
              { label: 'BAD', value: p.bad || 0, color: 'bg-fuchsia-500', textColor: 'text-fuchsia-400' },
              { label: 'MISS', value: p.miss || 0, color: 'bg-red-500', textColor: 'text-red-400' },
            ];
            return (
              <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPlay(null)}>
                <div
                  className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-piu-border shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Background image */}
                  {p.background_url && (
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-20"
                      style={{ backgroundImage: `url(${p.background_url})` }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-piu-bg/80 via-piu-bg/90 to-piu-bg" />

                  {/* Content */}
                  <div className="relative p-6">
                    {/* Close button */}
                    <button
                      className="absolute top-3 right-3 text-gray-500 hover:text-white text-xl leading-none"
                      onClick={() => setSelectedPlay(null)}
                    >
                      x
                    </button>

                    {/* Song info */}
                    <div className="text-center mb-5">
                      <p className="font-display font-bold text-lg leading-tight">{p.song_title}</p>
                      <p className="text-sm text-gray-400 mt-1">{p.mode} Lv.{p.level}</p>
                      {p.date_played && (
                        <p className="text-xs text-gray-600 mt-1">{p.date_played}</p>
                      )}
                    </div>

                    {/* Grade + Score */}
                    <div className="text-center mb-6">
                      {p.score > 0 ? (
                        <>
                          <p className={`text-4xl font-display font-black ${p.grade ? getGradeColor(p.grade) : rank.color}`}>
                            {p.grade || rank.label}
                          </p>
                          <p className="font-mono text-2xl font-bold mt-1">{p.score.toLocaleString()}</p>
                        </>
                      ) : (
                        <p className="text-3xl font-display font-black text-red-500">STAGE BREAK</p>
                      )}
                    </div>

                    {/* Judgment Breakdown */}
                    {hasBreakdown && (
                      <div className="space-y-2.5 mb-5">
                        {judgments.map(j => (
                          <div key={j.label} className="flex items-center gap-3">
                            <span className={`text-xs font-display font-bold w-16 ${j.textColor}`}>{j.label}</span>
                            <div className="flex-1 h-3 bg-piu-dark rounded-full overflow-hidden">
                              <div
                                className={`h-full ${j.color} rounded-full transition-all`}
                                style={{ width: totalNotes > 0 ? `${(j.value / totalNotes) * 100}%` : '0%' }}
                              />
                            </div>
                            <span className="font-mono text-sm font-bold w-12 text-right">{j.value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Max Combo + Kcal */}
                    {(p.max_combo > 0 || p.kcal > 0) && (
                      <div className="flex justify-center gap-6 text-center border-t border-piu-border/30 pt-4">
                        {p.max_combo > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 font-display">MAX COMBO</p>
                            <p className="font-mono font-bold text-lg text-piu-gold">{p.max_combo}</p>
                          </div>
                        )}
                        {p.kcal > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 font-display">KCAL</p>
                            <p className="font-mono font-bold text-lg text-orange-400">{p.kcal.toFixed(1)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* No breakdown notice */}
                    {!hasBreakdown && p.score > 0 && (
                      <p className="text-center text-xs text-gray-600 mt-2">
                        Judgment breakdown not available
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
