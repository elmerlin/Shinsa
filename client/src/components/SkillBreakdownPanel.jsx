import React, { useEffect, useState, useMemo } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { getSkillBreakdown } from '../utils/api';

function getGradeColor(grade) {
  const g = String(grade || '').toUpperCase();
  if (g.includes('SSS')) return 'text-sky-300';
  if (g.includes('SS')) return 'text-piu-gold';
  if (g.includes('S')) return 'text-amber-400';
  if (g.includes('AAA')) return 'text-piu-silver';
  if (g.includes('AA')) return 'text-piu-bronze';
  if (g === 'A+' || g === 'A') return 'text-amber-700';
  return 'text-gray-500';
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function SkillCard({ title, borderClass, skills, allSkills }) {
  if (!skills || skills.length === 0) return null;
  const items = skills.map((slug) => allSkills.find((s) => s.slug === slug)).filter(Boolean);

  return (
    <div className={`flex-1 min-w-0 rounded-lg border ${borderClass} bg-piu-dark/45 px-3 py-2.5`}>
      <p className="text-[11px] font-display font-bold tracking-wide text-gray-400 mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map((s) => (
          <div key={s.slug} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-200 truncate">{s.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-xs font-display font-bold ${getGradeColor(s.average_grade)}`}>
                {s.average_grade || '-'}
              </span>
              <span className="text-[11px] font-mono text-gray-400">{formatNumber(s.average_score)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SkillBreakdownPanel({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMode, setSelectedMode] = useState('Both');
  const [viewMode, setViewMode] = useState('radar');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = {};
    if (selectedMode !== 'Both') params.mode = selectedMode;
    getSkillBreakdown(userId, params)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load skill breakdown');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, selectedMode]);

  const playedSkills = useMemo(() => {
    if (!data?.skills) return [];
    return data.skills.filter((s) => s.played_charts > 0);
  }, [data]);

  const radarData = useMemo(() => {
    // Cap at 12 for readability
    return playedSkills.slice(0, 12).map((s) => ({
      skill: s.name,
      value: s.performance_score,
      score: s.average_score,
      grade: s.average_grade,
    }));
  }, [playedSkills]);

  if (loading && !data) {
    return (
      <div className="card">
        <h3 className="text-xs font-display font-bold tracking-wide text-piu-accent mb-3">SKILL BREAKDOWN</h3>
        <p className="text-center text-gray-500 py-4 text-xs animate-pulse">Loading skill data...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card">
        <h3 className="text-xs font-display font-bold tracking-wide text-piu-accent mb-3">SKILL BREAKDOWN</h3>
        <p className="text-center text-red-400 py-4 text-xs">{error}</p>
      </div>
    );
  }

  if (!data || playedSkills.length === 0) {
    return null;
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-display font-bold tracking-wide text-piu-accent">SKILL BREAKDOWN</h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-piu-border/40">
            {['Both', 'Single', 'Double'].map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMode(m)}
                className={`px-2 py-0.5 text-[10px] font-display font-bold transition-colors ${
                  selectedMode === m
                    ? 'bg-piu-accent/20 text-piu-accent'
                    : 'bg-piu-dark text-gray-500 hover:text-gray-300'
                }`}
              >
                {m === 'Both' ? 'All' : m === 'Single' ? 'S' : 'D'}
              </button>
            ))}
          </div>
          <div className="flex rounded-md overflow-hidden border border-piu-border/40">
            {[
              { key: 'radar', label: 'Chart' },
              { key: 'list', label: 'List' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`px-2 py-0.5 text-[10px] font-display font-bold transition-colors ${
                  viewMode === key
                    ? 'bg-piu-accent/20 text-piu-accent'
                    : 'bg-piu-dark text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Radar chart */}
      {viewMode === 'radar' && radarData.length >= 3 && (
        <div className="mb-4">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="rgba(148,163,184,0.2)" />
              <PolarAngleAxis
                dataKey="skill"
                tick={{ fill: '#9ca3af', fontSize: 10, fontFamily: 'Rajdhani, sans-serif' }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Radar
                dataKey="value"
                stroke="#ff3366"
                fill="#ff3366"
                fillOpacity={0.25}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: 'Inter, sans-serif',
                }}
                formatter={(value, _name, props) => {
                  const { payload } = props;
                  return [
                    `${payload.grade || '-'} (${formatNumber(payload.score)})`,
                    payload.skill,
                  ];
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {viewMode === 'radar' && radarData.length < 3 && (
        <p className="text-center text-gray-500 py-4 text-xs mb-4">
          Play charts with at least 3 different skills to see the radar chart.
        </p>
      )}

      {/* Strengths & Weaknesses */}
      {(data.strengths?.length > 0 || data.weaknesses?.length > 0) && (
        <div className="flex gap-2 mb-4">
          <SkillCard
            title="STRENGTHS"
            borderClass="border-emerald-400/40"
            skills={data.strengths}
            allSkills={data.skills}
          />
          <SkillCard
            title="WEAKNESSES"
            borderClass="border-red-400/40"
            skills={data.weaknesses}
            allSkills={data.skills}
          />
        </div>
      )}

      {/* Full skill list */}
      {viewMode === 'list' && (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {data.skills.map((s) => (
            <div
              key={s.slug}
              className="rounded-lg border border-piu-border/40 bg-piu-dark/45 px-2.5 py-2 flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-200 truncate">{s.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-display font-bold ${getGradeColor(s.average_grade)}`}>
                      {s.average_grade || '-'}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">{formatNumber(s.average_score)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">
                      {s.played_charts}/{s.total_charts} played
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {s.pass_rate}% pass
                    </span>
                  </div>
                  {/* Mini play rate bar */}
                  <div className="w-16 h-1.5 rounded-full bg-piu-dark/80 border border-piu-border/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-piu-accent/60"
                      style={{ width: `${Math.min(100, s.play_rate)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
