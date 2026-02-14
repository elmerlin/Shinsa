import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getUserProfile, getUserStats } from '../utils/api';
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

export default function ProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    getUserProfile(id).then(setProfile).catch(() => {});
    getUserStats(id).then(setStats).catch(() => {});
  }, [id]);

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

  if (!profile) {
    return <div className="text-center py-20 text-gray-500">Loading profile...</div>;
  }

  const age = profile.show_age && profile.date_of_birth ? getAge(profile.date_of_birth) : null;
  const genderSymbol = profile.gender ? GENDER_SYMBOLS[profile.gender] || '' : '';
  const flag = getCountryFlag(profile.nationality);

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
      <div className="flex gap-2 mb-4">
        {['overview', 'tournaments', 'duels', 'songs'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
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
    </div>
  );
}
