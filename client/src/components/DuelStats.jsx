import React, { useState, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { getRank, SongJacket } from '../pages/DuelView';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'Single', label: 'Singles' },
  { value: 'Double', label: 'Doubles' },
];

export default function DuelStats({ duel, songs }) {
  const [filter, setFilter] = useState('all');

  const filteredSongs = useMemo(() => {
    if (filter === 'all') return songs;
    return songs.filter(s => s.song_mode === filter);
  }, [songs, filter]);

  // Compute stats
  const stats = useMemo(() => {
    const p1Wins = filteredSongs.filter(s => s.winner === 'player1').length;
    const p2Wins = filteredSongs.filter(s => s.winner === 'player2').length;
    const totalDraws = filteredSongs.filter(s => s.winner === 'draw').length;
    const p1TotalScore = filteredSongs.reduce((sum, s) => sum + s.player1_score, 0);
    const p2TotalScore = filteredSongs.reduce((sum, s) => sum + s.player2_score, 0);
    const p1Avg = filteredSongs.length > 0 ? Math.round(p1TotalScore / filteredSongs.length) : 0;
    const p2Avg = filteredSongs.length > 0 ? Math.round(p2TotalScore / filteredSongs.length) : 0;
    const p1Best = filteredSongs.length > 0 ? Math.max(...filteredSongs.map(s => s.player1_score)) : 0;
    const p2Best = filteredSongs.length > 0 ? Math.max(...filteredSongs.map(s => s.player2_score)) : 0;

    return { p1Wins, p2Wins, totalDraws, p1TotalScore, p2TotalScore, p1Avg, p2Avg, p1Best, p2Best };
  }, [filteredSongs]);

  // Chart data: group by level
  const chartData = useMemo(() => {
    const levelMap = {};
    filteredSongs.forEach(s => {
      const lvl = s.song_level;
      if (!levelMap[lvl]) {
        levelMap[lvl] = { level: lvl, p1Scores: [], p2Scores: [], count: 0 };
      }
      levelMap[lvl].p1Scores.push(s.player1_score);
      levelMap[lvl].p2Scores.push(s.player2_score);
      levelMap[lvl].count++;
    });

    return Object.values(levelMap)
      .sort((a, b) => a.level - b.level)
      .map(d => ({
        level: `Lv.${d.level}`,
        levelNum: d.level,
        songsPlayed: d.count,
        p1Avg: Math.round(d.p1Scores.reduce((a, b) => a + b, 0) / d.p1Scores.length),
        p2Avg: Math.round(d.p2Scores.reduce((a, b) => a + b, 0) / d.p2Scores.length),
      }));
  }, [filteredSongs]);

  if (songs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-display">No completed songs yet</p>
        <p className="text-sm mt-1">Play some songs to see statistics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-display">Filter:</span>
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1 rounded-lg text-xs font-display font-bold transition-colors ${
              filter === opt.value
                ? 'bg-piu-accent text-white'
                : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card text-center">
          <p className="text-xs text-gray-500 font-display mb-1">{duel.player1_name}</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="font-mono font-bold text-lg text-piu-green">{stats.p1Wins}</p>
              <p className="text-[10px] text-gray-600">Wins</p>
            </div>
            <div>
              <p className="font-mono font-bold text-sm">{stats.p1Avg.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600">Avg Score</p>
            </div>
            <div>
              <p className="font-mono font-bold text-sm">{stats.p1Best.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600">Best</p>
            </div>
          </div>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 font-display mb-1">{duel.player2_name}</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="font-mono font-bold text-lg text-piu-green">{stats.p2Wins}</p>
              <p className="text-[10px] text-gray-600">Wins</p>
            </div>
            <div>
              <p className="font-mono font-bold text-sm">{stats.p2Avg.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600">Avg Score</p>
            </div>
            <div>
              <p className="font-mono font-bold text-sm">{stats.p2Best.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600">Best</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="font-display font-bold text-sm text-piu-accent mb-4">Average Score by Level</h3>
          <div className="h-[300px] sm:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="level" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis
                  yAxisId="left"
                  domain={[
                    (dataMin) => Math.max(0, Math.floor((Math.min(...chartData.map(d => Math.min(d.p1Avg, d.p2Avg))) - 50000) / 50000) * 50000),
                    1000000
                  ]}
                  tickFormatter={(v) => v >= 1000000 ? '1M' : `${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: '#888' }}
                  label={{ value: 'Avg Score', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 10, fill: '#666' } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#888' }}
                  label={{ value: 'Songs', angle: 90, position: 'insideRight', offset: 15, style: { fontSize: 10, fill: '#666' } }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#aaa', fontWeight: 'bold' }}
                  formatter={(value, name) => {
                    if (name === 'Songs Played') return [value, name];
                    return [Number(value).toLocaleString(), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar yAxisId="right" dataKey="songsPlayed" name="Songs Played" fill="#333" opacity={0.6} barSize={30} />
                <Line yAxisId="left" type="monotone" dataKey="p1Avg" name={duel.player1_name} stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                <Line yAxisId="left" type="monotone" dataKey="p2Avg" name={duel.player2_name} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Song-by-Song Comparison */}
      {filteredSongs.length > 0 && (
        <div className="card">
          <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Song Results</h3>
          {/* Header */}
          <div className="flex items-center text-[10px] text-gray-500 font-display font-bold mb-2 px-1">
            <div className="flex-1 text-right pr-2">{duel.player1_name}</div>
            <div className="w-12 text-center shrink-0"></div>
            <div className="flex-1 pl-2">{duel.player2_name}</div>
          </div>
          <div className="space-y-1.5">
            {filteredSongs.map((song) => {
              const p1Rank = getRank(song.player1_score);
              const p2Rank = getRank(song.player2_score);
              const p1Won = song.winner === 'player1';
              const p2Won = song.winner === 'player2';
              return (
                <div key={song.id} className="flex items-center gap-0 py-1 border-b border-piu-border/20 last:border-0">
                  {/* Player 1 score - right aligned */}
                  <div className={`flex-1 flex items-center justify-end gap-1 pr-2 ${p1Won ? 'text-piu-green' : ''}`}>
                    {p1Won && <span className="text-[10px]">&#9733;</span>}
                    <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p1Rank.bg} ${p1Rank.color}`}>
                      {p1Rank.label}
                    </span>
                    <span className="font-mono text-xs font-bold">{Number(song.player1_score).toLocaleString()}</span>
                  </div>
                  {/* Song jacket center */}
                  <div className="shrink-0">
                    <SongJacket song={song} size="sm" />
                  </div>
                  {/* Player 2 score - left aligned */}
                  <div className={`flex-1 flex items-center gap-1 pl-2 ${p2Won ? 'text-piu-green' : ''}`}>
                    <span className="font-mono text-xs font-bold">{Number(song.player2_score).toLocaleString()}</span>
                    <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p2Rank.bg} ${p2Rank.color}`}>
                      {p2Rank.label}
                    </span>
                    {p2Won && <span className="text-[10px]">&#9733;</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rank Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RankDistribution playerName={duel.player1_name} songs={filteredSongs} scoreKey="player1_score" color="red" />
        <RankDistribution playerName={duel.player2_name} songs={filteredSongs} scoreKey="player2_score" color="blue" />
      </div>
    </div>
  );
}

function RankDistribution({ playerName, songs, scoreKey, color }) {
  const rankCounts = {};
  songs.forEach(s => {
    const rank = getRank(s[scoreKey]);
    rankCounts[rank.label] = (rankCounts[rank.label] || 0) + 1;
  });

  const rankLabels = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA+', 'AAA', 'AA+', 'AA', 'A+', 'A', 'B', 'C', 'D', 'F'];
  const entries = rankLabels.filter(r => rankCounts[r]).map(r => ({ rank: r, count: rankCounts[r] }));

  if (entries.length === 0) return null;

  return (
    <div className="card">
      <p className={`text-xs font-display font-bold mb-2 ${color === 'red' ? 'text-red-400' : 'text-blue-400'}`}>{playerName} Ranks</p>
      <div className="space-y-1">
        {entries.map(e => {
          const rankInfo = getRank(e.rank === 'SSS+' ? 995000 : e.rank === 'F' ? 0 : 500000);
          // Find exact rank info by label
          const r = [
            { label: 'SSS+', color: 'text-sky-300' }, { label: 'SSS', color: 'text-sky-400' },
            { label: 'SS+', color: 'text-piu-gold' }, { label: 'SS', color: 'text-yellow-400' },
            { label: 'S+', color: 'text-amber-400' }, { label: 'S', color: 'text-amber-500' },
            { label: 'AAA+', color: 'text-piu-silver' }, { label: 'AAA', color: 'text-gray-300' },
            { label: 'AA+', color: 'text-piu-bronze' }, { label: 'AA', color: 'text-piu-bronze' },
            { label: 'A+', color: 'text-amber-700' }, { label: 'A', color: 'text-amber-700' },
            { label: 'B', color: 'text-gray-600' }, { label: 'C', color: 'text-gray-600' },
            { label: 'D', color: 'text-gray-600' }, { label: 'F', color: 'text-gray-600' },
          ].find(x => x.label === e.rank);

          return (
            <div key={e.rank} className="flex items-center gap-2">
              <span className={`font-display font-bold text-xs w-10 ${r?.color || 'text-gray-400'}`}>{e.rank}</span>
              <div className="flex-1 h-3 bg-piu-dark rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${color === 'red' ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, (e.count / songs.length) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 font-mono w-6 text-right">{e.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
