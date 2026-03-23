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

const AA_BASE_SCORE = 900000;
const RADAR_MAX_SCORE = 1000000;
const RADAR_SKILL_LIMIT = 12;

function toAaRelativeRadarValue(score) {
  const numericScore = parseInt(score, 10) || 0;
  const normalized = ((numericScore - AA_BASE_SCORE) / (RADAR_MAX_SCORE - AA_BASE_SCORE)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

function toRelativeRadarValue(score, minScore, maxScore) {
  const numericScore = parseInt(score, 10) || 0;
  if (maxScore <= minScore) return 50;
  const normalized = ((numericScore - minScore) / (maxScore - minScore)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

function SkillDetailModal({ skill, onClose }) {
  if (!skill) return null;

  const statRows = [
    { label: 'Average Score', value: formatNumber(skill.average_score), extra: skill.average_grade, extraColor: getGradeColor(skill.average_grade) },
    { label: 'Performance Score', value: `${skill.performance_score}/100` },
    { label: 'Charts Played', value: `${skill.played_charts} / ${skill.total_charts}` },
    { label: 'Charts Passed', value: `${skill.passed_charts} / ${skill.played_charts}` },
    { label: 'Play Rate', value: `${skill.play_rate}%` },
    { label: 'Pass Rate', value: `${skill.pass_rate}%` },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm text-white">{skill.name}</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        {/* Stats */}
        <div className="px-4 py-3 space-y-2">
          {statRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{row.label}</span>
              <div className="flex items-center gap-1.5">
                {row.extra && (
                  <span className={`text-xs font-display font-bold ${row.extraColor || 'text-gray-300'}`}>{row.extra}</span>
                )}
                <span className="text-xs font-mono text-gray-200">{row.value}</span>
              </div>
            </div>
          ))}

          {/* Performance bar */}
          <div className="pt-1">
            <div className="w-full h-2 rounded-full bg-piu-dark/80 border border-piu-border/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-piu-accent/70 transition-all duration-300"
                style={{ width: `${Math.min(100, skill.performance_score)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Best & Worst charts */}
        {(skill.best_chart || skill.worst_chart) && (
          <div className="px-4 pb-3 space-y-2">
            <div className="border-t border-piu-border/40 pt-2">
              <p className="text-[10px] font-display font-bold tracking-wide text-gray-500 mb-1.5">NOTABLE CHARTS</p>
              {skill.best_chart && (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 mb-1.5">
                  <p className="text-[10px] text-emerald-400/70 font-display mb-0.5">BEST</p>
                  <p className="text-xs text-gray-200 truncate">{skill.best_chart.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-display font-bold ${
                      skill.best_chart.mode === 'Single' ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {skill.best_chart.mode === 'Single' ? 'S' : 'D'}{skill.best_chart.level}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">{formatNumber(skill.best_chart.score)}</span>
                  </div>
                </div>
              )}
              {skill.worst_chart && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2">
                  <p className="text-[10px] text-red-400/70 font-display mb-0.5">WORST</p>
                  <p className="text-xs text-gray-200 truncate">{skill.worst_chart.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-display font-bold ${
                      skill.worst_chart.mode === 'Single' ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {skill.worst_chart.mode === 'Single' ? 'S' : 'D'}{skill.worst_chart.level}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">{formatNumber(skill.worst_chart.score)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillCard({ title, borderClass, skills, allSkills, onSkillClick }) {
  if (!skills || skills.length === 0) return null;
  const items = skills.map((slug) => allSkills.find((s) => s.slug === slug)).filter(Boolean);

  return (
    <div className={`flex-1 min-w-0 rounded-lg border ${borderClass} bg-piu-dark/45 px-3 py-2.5`}>
      <p className="text-[11px] font-display font-bold tracking-wide text-gray-400 mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map((s) => (
          <button
            type="button"
            key={s.slug}
            onClick={() => onSkillClick(s)}
            className="w-full flex items-center justify-between gap-2 hover:bg-white/5 rounded px-1 py-0.5 -mx-1 transition-colors text-left"
          >
            <span className="text-xs text-gray-200 truncate">{s.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-xs font-display font-bold ${getGradeColor(s.average_grade)}`}>
                {s.average_grade || '-'}
              </span>
              <span className="text-[11px] font-mono text-gray-400">{formatNumber(s.average_score)}</span>
            </div>
          </button>
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
  const [radarScaleMode, setRadarScaleMode] = useState('relative');
  const [selectedSkill, setSelectedSkill] = useState(null);

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

  const radarSkills = useMemo(() => {
    if (playedSkills.length <= RADAR_SKILL_LIMIT) return playedSkills;
    const topCount = Math.floor(RADAR_SKILL_LIMIT / 2);
    const bottomCount = RADAR_SKILL_LIMIT - topCount;
    const top = playedSkills.slice(0, topCount);
    const bottom = playedSkills.slice(-bottomCount);
    return [...top, ...bottom];
  }, [playedSkills]);

  const radarScoreRange = useMemo(() => {
    const scores = radarSkills
      .map((s) => parseInt(s.average_score, 10) || 0)
      .filter((score) => score > 0);
    if (scores.length === 0) return { min: 0, max: 0 };
    return {
      min: Math.min(...scores),
      max: Math.max(...scores),
    };
  }, [radarSkills]);

  const radarData = useMemo(() => {
    return radarSkills.map((s) => {
      const aaRelativePct = toAaRelativeRadarValue(s.average_score);
      const relativePct = toRelativeRadarValue(s.average_score, radarScoreRange.min, radarScoreRange.max);
      return {
        skill: s.name,
        value: radarScaleMode === 'relative' ? relativePct : aaRelativePct,
        score: s.average_score,
        grade: s.average_grade,
        aaRelativePct,
        relativePct,
      };
    });
  }, [radarSkills, radarScaleMode, radarScoreRange.max, radarScoreRange.min]);

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
          {viewMode === 'radar' && (
            <div className="flex rounded-md overflow-hidden border border-piu-border/40">
              {[
                { key: 'relative', label: 'Rel' },
                { key: 'absolute', label: 'Abs' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRadarScaleMode(key)}
                  className={`px-2 py-0.5 text-[10px] font-display font-bold transition-colors ${
                    radarScaleMode === key
                      ? 'bg-piu-accent/20 text-piu-accent'
                      : 'bg-piu-dark text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
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
                formatter={(_value, _name, props) => {
                  const { payload } = props;
                  const aaScale = Number.isFinite(payload?.aaRelativePct) ? payload.aaRelativePct.toFixed(1) : '0.0';
                  const relativeScale = Number.isFinite(payload?.relativePct) ? payload.relativePct.toFixed(1) : '0.0';
                  return [
                    `${payload?.grade || '-'} (${formatNumber(payload?.score)}) • Rel ${relativeScale}% • AA ${aaScale}%`,
                    payload.skill,
                  ];
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
          <p className="mt-1 text-center text-[10px] text-gray-600">
            {playedSkills.length > RADAR_SKILL_LIMIT
              ? `Showing top 6 strengths + bottom 6 weaknesses (${radarSkills.length} skills).`
              : `Showing all played skills (${radarSkills.length}).`}
            {' '}
            {radarScaleMode === 'relative'
              ? `Relative scale ${formatNumber(radarScoreRange.min)}-${formatNumber(radarScoreRange.max)}.`
              : 'Absolute scale AA (900,000) to 1,000,000.'}
          </p>
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
            onSkillClick={setSelectedSkill}
          />
          <SkillCard
            title="WEAKNESSES"
            borderClass="border-red-400/40"
            skills={data.weaknesses}
            allSkills={data.skills}
            onSkillClick={setSelectedSkill}
          />
        </div>
      )}

      {/* Full skill list */}
      {viewMode === 'list' && (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {data.skills.map((s) => (
            <button
              type="button"
              key={s.slug}
              onClick={() => setSelectedSkill(s)}
              className="w-full rounded-lg border border-piu-border/40 bg-piu-dark/45 px-2.5 py-2 flex items-center gap-3 hover:border-piu-accent/40 transition-colors text-left"
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
            </button>
          ))}
        </div>
      )}

      {/* Skill detail modal */}
      <SkillDetailModal
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
      />
    </div>
  );
}
