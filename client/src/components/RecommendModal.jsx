import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getSongRecommendations, savePostDraft } from '../utils/api';
import { serializeSessionPlanMarker } from '../utils/sessionPlanMarker';

const ALL_SKILLS = [
  { slug: 'jump', name: 'jump' },
  { slug: 'drill', name: 'drill' },
  { slug: 'run', name: 'run' },
  { slug: 'anchor_run', name: 'anchor run' },
  { slug: 'run_without_twists', name: 'run without twists' },
  { slug: 'twist_90', name: 'twist 90' },
  { slug: 'twist_over90', name: 'twist over90' },
  { slug: 'twist_close', name: 'twist close' },
  { slug: 'twist_far', name: 'twist far' },
  { slug: 'side3_singles', name: 'side3 singles' },
  { slug: 'mid6_doubles', name: 'mid6 doubles' },
  { slug: 'mid4_doubles', name: 'mid4 doubles' },
  { slug: 'doublestep', name: 'doublestep' },
  { slug: 'jack', name: 'jack' },
  { slug: 'footswitch', name: 'footswitch' },
  { slug: 'bracket', name: 'bracket' },
  { slug: 'staggered_bracket', name: 'staggered bracket' },
  { slug: 'bracket_run', name: 'bracket run' },
  { slug: 'bracket_drill', name: 'bracket drill' },
  { slug: 'bracket_jump', name: 'bracket jump' },
  { slug: 'bracket_twist', name: 'bracket twist' },
  { slug: '5-stair', name: '5-stair' },
  { slug: '10-stair', name: '10-stair' },
  { slug: 'yog_walk', name: 'yog walk' },
  { slug: 'cross-pad_transition', name: 'cross-pad transition' },
  { slug: 'co-op_pad_transition', name: 'co-op pad transition' },
  { slug: 'split', name: 'split' },
  { slug: 'hold_footswitch', name: 'hold footswitch' },
  { slug: 'hold_footslide', name: 'hold footslide' },
  { slug: 'hands', name: 'hands' },
  { slug: 'bursty', name: 'bursty' },
  { slug: 'sustained', name: 'sustained' },
];

const FEELINGS = [
  { value: 'ambitious', label: 'Ambitious', emoji: '\uD83D\uDD25', desc: '+1 level to searches', color: 'from-red-500 to-orange-600 border-red-400/50' },
  { value: 'normal', label: 'Normal', emoji: '\uD83D\uDE0E', desc: 'No modifier', color: 'from-blue-500 to-blue-700 border-blue-400/50' },
  { value: 'lethargic', label: 'Lethargic', emoji: '\uD83D\uDE34', desc: '-1 level to searches', color: 'from-purple-500 to-purple-800 border-purple-400/50' },
];

const MODES = [
  { value: 'both', label: 'Both', color: 'from-cyan-500 to-cyan-700 border-cyan-400/50' },
  { value: 'single', label: 'Singles', color: 'from-red-500 to-red-700 border-red-400/50' },
  { value: 'double', label: 'Doubles', color: 'from-green-500 to-emerald-700 border-green-400/50' },
];

function SkillChip({ skill, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(skill.slug)}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-display font-bold border transition-all ${
        selected
          ? 'bg-cyan-500/30 border-cyan-400/60 text-cyan-200'
          : 'bg-piu-dark/50 border-piu-border/40 text-gray-400 hover:border-gray-500 hover:text-gray-300'
      }`}
    >
      {skill.name}
    </button>
  );
}

function AvoidSkillChip({ skill, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(skill.slug)}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-display font-bold border transition-all ${
        selected
          ? 'bg-red-500/30 border-red-400/60 text-red-200'
          : 'bg-piu-dark/50 border-piu-border/40 text-gray-400 hover:border-gray-500 hover:text-gray-300'
      }`}
    >
      {skill.name}
    </button>
  );
}

function SongCard({ chart, index }) {
  const isSingle = chart.mode === 'Single';
  const badgeColor = isSingle ? 'bg-red-600' : 'bg-green-600';

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-piu-border/40 bg-piu-dark/40 p-2.5">
      <div className="text-[10px] text-gray-500 font-mono w-4 pt-1 shrink-0">{index + 1}</div>
      <div className="relative shrink-0">
        {chart.jacket_url ? (
          <img src={chart.jacket_url} alt="" className="w-10 h-10 rounded object-cover" />
        ) : (
          <div className="w-10 h-10 rounded bg-piu-dark flex items-center justify-center font-display font-bold text-xs text-gray-500">
            {(chart.title || '?')[0]}
          </div>
        )}
        <span className={`absolute -bottom-1 -right-1 min-w-[16px] h-[14px] px-1 rounded text-[8px] flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
          {chart.level}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <Link
          to={`/songs/chart/${chart.chart_id}`}
          className="text-sm font-display font-bold leading-tight text-gray-200 hover:text-cyan-300 transition-colors line-clamp-1"
        >
          {chart.title}
        </Link>
        <p className="text-[10px] text-gray-500">{chart.artist || 'Unknown artist'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-display font-bold ${isSingle ? 'text-red-400' : 'text-green-400'}`}>
            {isSingle ? 'S' : 'D'}{chart.level}
          </span>
          {chart.best_score != null && (
            <span className="text-[10px] text-gray-400 font-mono">
              Best: {parseInt(chart.best_score, 10).toLocaleString()}
              {chart.best_grade ? ` (${chart.best_grade})` : ''}
            </span>
          )}
          {chart.best_score == null && (
            <span className="text-[10px] text-yellow-400/80 font-display">New!</span>
          )}
        </div>
        {(chart.skills || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {chart.skills.map((s) => (
              <span key={s.slug} className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-display">
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SongSection({ title, subtitle, songs, borderColor = 'border-cyan-400/30', bgGradient = 'from-cyan-500/10' }) {
  if (!songs || songs.length === 0) return null;
  return (
    <div className={`rounded-xl border ${borderColor} bg-gradient-to-br ${bgGradient} via-transparent to-transparent p-3`}>
      <p className="text-[11px] font-display font-bold uppercase tracking-wider text-cyan-300">{title}</p>
      {subtitle && <p className="text-[10px] text-gray-400 mt-0.5 mb-2">{subtitle}</p>}
      <div className="space-y-1.5 mt-2">
        {songs.map((chart, idx) => (
          <SongCard key={chart.chart_id} chart={chart} index={idx} />
        ))}
      </div>
    </div>
  );
}

// Step indicators
function StepIndicator({ currentStep, totalSteps }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-2">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === currentStep
              ? 'w-6 bg-cyan-400'
              : i < currentStep
                ? 'w-3 bg-cyan-400/40'
                : 'w-3 bg-gray-600'
          }`}
        />
      ))}
    </div>
  );
}

export default function RecommendModal({ open, onClose, user }) {
  const [step, setStep] = useState(0);
  const [feeling, setFeeling] = useState('normal');
  const [chartMode, setChartMode] = useState('both');
  const [skillsTrain, setSkillsTrain] = useState([]);
  const [skillsAvoid, setSkillsAvoid] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const captureRef = useRef(null);

  const totalSteps = 5; // feeling, mode, skills train, skills avoid, results

  const toggleSkillTrain = (slug) => {
    setSkillsTrain((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const toggleSkillAvoid = (slug) => {
    setSkillsAvoid((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const availableAvoidSkills = useMemo(
    () => ALL_SKILLS.filter((s) => !skillsTrain.includes(s.slug)),
    [skillsTrain]
  );

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSongRecommendations({
        feeling,
        chart_mode: chartMode,
        skills_train: skillsTrain,
        skills_avoid: skillsAvoid,
      });
      setResults(data);
      setGeneratedAt(new Date());
      setDraftSaved(false);
      setStep(4);
    } catch (err) {
      setError(err.message || 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 3) {
      handleGenerate();
    } else {
      setStep((prev) => Math.min(prev + 1, totalSteps - 1));
    }
  };

  const handleBack = () => {
    if (step === 4) {
      setStep(3);
      setResults(null);
    } else {
      setStep((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleReset = () => {
    setStep(0);
    setFeeling('normal');
    setChartMode('both');
    setSkillsTrain([]);
    setSkillsAvoid([]);
    setResults(null);
    setGeneratedAt(null);
    setDraftSaved(false);
    setError('');
  };

  const formatDateTime = (date) => {
    if (!date) return '';
    return date.toLocaleDateString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const buildDraftContent = () => {
    if (!results) return '';
    const pickFields = (s) => ({
      title: s.title, mode: s.mode, level: s.level,
      jacket_url: s.jacket_url, best_score: s.best_score, best_grade: s.best_grade,
    });
    const marker = serializeSessionPlanMarker({
      generatedAt: generatedAt ? generatedAt.toISOString() : new Date().toISOString(),
      feeling: results.feeling,
      chartMode: results.chart_mode,
      pumbility: results.pumbility,
      avgRating: results.avg_rating,
      scoringLevel: results.scoring_level,
      passingLevel: results.passing_level,
      adjustedScoringLevel: results.adjusted_scoring_level,
      adjustedPassingLevel: results.adjusted_passing_level,
      skillsTrain: results.skills_train,
      skillsAvoid: results.skills_avoid,
      activation: (results.activation || []).map(pickFields),
      scoring: (results.scoring_songs || []).map(pickFields),
      passing: (results.passing_songs || []).map(pickFields),
    });
    return marker;
  };

  const handleDownloadImage = async () => {
    if (!captureRef.current || captureBusy) return;
    setCaptureBusy(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(captureRef.current, {
        backgroundColor: '#071326',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `session-plan-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setError(err?.message || 'Failed to create image');
    } finally {
      setCaptureBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (savingDraft || draftSaved) return;
    setSavingDraft(true);
    try {
      await savePostDraft({ content: buildDraftContent() });
      setDraftSaved(true);
    } catch (err) {
      setError(err?.message || 'Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  if (!open) return null;

  const feelingLabel = FEELINGS.find((f) => f.value === feeling);
  const modeLabel = MODES.find((m) => m.value === chartMode);

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 pb-20 sm:pb-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-piu-border/60 bg-gradient-to-br from-[#0b1324] via-[#0f1d36] to-[#0b1324] shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-2xl border-b border-piu-border/40 bg-[#0b1324]/95 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-display font-bold tracking-wide">
                {step < 4 ? 'Song Recommender' : 'Your Session Plan'}
              </h2>
              <p className="text-[10px] text-gray-500">
                {step === 0 && 'How are you feeling today?'}
                {step === 1 && 'What mode do you want to play?'}
                {step === 2 && 'Select skills to practice'}
                {step === 3 && 'Select skills to avoid'}
                {step === 4 && 'Here are your recommended charts'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {step < 4 && <StepIndicator currentStep={step} totalSteps={4} />}
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Step 0: Feeling */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Your mood affects the difficulty of recommended charts.
              </p>
              <div className="space-y-2">
                {FEELINGS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFeeling(f.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                      feeling === f.value
                        ? `bg-gradient-to-r ${f.color} text-white shadow-lg`
                        : 'border-piu-border/40 bg-piu-dark/30 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <span className="text-2xl">{f.emoji}</span>
                    <div className="text-left">
                      <p className="font-display font-bold text-sm">{f.label}</p>
                      <p className={`text-[10px] ${feeling === f.value ? 'text-white/80' : 'text-gray-500'}`}>{f.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Mode */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Choose the chart mode for your session.
              </p>
              <div className="space-y-2">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setChartMode(m.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                      chartMode === m.value
                        ? `bg-gradient-to-r ${m.color} text-white shadow-lg`
                        : 'border-piu-border/40 bg-piu-dark/30 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-left">
                      <p className="font-display font-bold text-sm">{m.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Skills to train */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Select skills you want to practice. Charts must include at least one of these skills.
              </p>
              <p className="text-[10px] text-gray-500">
                {skillsTrain.length === 0 ? 'No filter applied — all charts eligible' : `${skillsTrain.length} skill(s) selected`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SKILLS.map((skill) => (
                  <SkillChip
                    key={skill.slug}
                    skill={skill}
                    selected={skillsTrain.includes(skill.slug)}
                    onClick={toggleSkillTrain}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Skills to avoid */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Select skills you want to avoid. Charts with these skills will be excluded.
              </p>
              <p className="text-[10px] text-gray-500">
                {skillsAvoid.length === 0 ? 'No skills excluded' : `${skillsAvoid.length} skill(s) excluded`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableAvoidSkills.map((skill) => (
                  <AvoidSkillChip
                    key={skill.slug}
                    skill={skill}
                    selected={skillsAvoid.includes(skill.slug)}
                    onClick={toggleSkillAvoid}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {step === 4 && results && (
            <div className="space-y-4" ref={captureRef}>
              {/* Date/time */}
              {generatedAt && (
                <p className="text-[10px] text-gray-500 font-display text-right">{formatDateTime(generatedAt)}</p>
              )}

              {/* Summary header */}
              <div className="rounded-xl border border-piu-border/40 bg-piu-dark/30 p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2.5 py-2">
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Pumbility</p>
                    <p className="text-sm font-display font-bold text-gray-100">{(results.pumbility || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2.5 py-2">
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Avg Rating</p>
                    <p className="text-sm font-display font-bold text-cyan-300">{results.avg_rating}</p>
                  </div>
                  <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2.5 py-2">
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Scoring Lv</p>
                    <p className="text-sm font-display font-bold text-amber-300">
                      {results.scoring_level}
                      {results.adjusted_scoring_level !== results.scoring_level && (
                        <span className="text-[10px] text-gray-400 ml-1">
                          (adj. {results.adjusted_scoring_level})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2.5 py-2">
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Passing Lv</p>
                    <p className="text-sm font-display font-bold text-emerald-300">
                      {results.passing_level}
                      {results.adjusted_passing_level !== results.passing_level && (
                        <span className="text-[10px] text-gray-400 ml-1">
                          (adj. {results.adjusted_passing_level})
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Preferences */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-display font-bold border ${
                    results.feeling === 'ambitious' ? 'bg-red-500/20 border-red-500/40 text-red-300'
                    : results.feeling === 'lethargic' ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                    : 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                  }`}>
                    {feelingLabel?.emoji} {feelingLabel?.label}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-display font-bold border ${
                    results.chart_mode === 'single' ? 'bg-red-500/20 border-red-500/40 text-red-300'
                    : results.chart_mode === 'double' ? 'bg-green-500/20 border-green-500/40 text-green-300'
                    : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  }`}>
                    {modeLabel?.label}
                  </span>
                </div>

                {results.skills_train.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide mb-1">Training</p>
                    <div className="flex flex-wrap gap-1">
                      {results.skills_train.map((slug) => {
                        const skill = ALL_SKILLS.find((s) => s.slug === slug);
                        return (
                          <span key={slug} className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-display">
                            {skill?.name || slug}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {results.skills_avoid.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide mb-1">Avoiding</p>
                    <div className="flex flex-wrap gap-1">
                      {results.skills_avoid.map((slug) => {
                        const skill = ALL_SKILLS.find((s) => s.slug === slug);
                        return (
                          <span key={slug} className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/15 border border-red-500/25 text-red-300 font-display">
                            {skill?.name || slug}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Activation songs */}
              <SongSection
                title="Activation"
                subtitle="Get your body moving with these charts"
                songs={results.activation}
                borderColor="border-amber-400/30"
                bgGradient="from-amber-500/10"
              />

              {/* Scoring songs */}
              <SongSection
                title="Scoring"
                subtitle="Push for higher scores on these charts"
                songs={results.scoring_songs}
                borderColor="border-cyan-400/30"
                bgGradient="from-cyan-500/10"
              />

              {/* Passing songs */}
              <SongSection
                title="Passing"
                subtitle="Challenge yourself to clear these charts"
                songs={results.passing_songs}
                borderColor="border-emerald-400/30"
                bgGradient="from-emerald-500/10"
              />
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-sm text-gray-400 font-display">Generating recommendations...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rounded-b-2xl border-t border-piu-border/40 bg-[#0b1324]/95 backdrop-blur-sm px-4 py-3 space-y-2">
          {/* Action buttons row (results only) */}
          {step === 4 && results && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={captureBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-piu-border/40 bg-piu-dark/30 text-gray-300 text-xs font-display font-bold hover:bg-piu-dark/60 transition-colors disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {captureBusy ? 'Saving...' : 'Download'}
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || draftSaved}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-display font-bold transition-colors disabled:opacity-50 ${
                  draftSaved
                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                    : 'border-piu-border/40 bg-piu-dark/30 text-gray-300 hover:bg-piu-dark/60'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {draftSaved ? 'Saved!' : savingDraft ? 'Saving...' : 'Save Draft'}
              </button>
            </div>
          )}

          {/* Navigation row */}
          <div className="flex items-center justify-between gap-2">
            {step > 0 && !loading ? (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 rounded-xl border border-piu-border/40 bg-piu-dark/30 text-gray-300 text-sm font-display font-bold hover:bg-piu-dark/60 transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {step === 4 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl border border-piu-border/40 bg-piu-dark/30 text-gray-300 text-sm font-display font-bold hover:bg-piu-dark/60 transition-colors"
                >
                  Start Over
                </button>
              )}
              {step < 4 && !loading && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 border border-cyan-300/30 text-white text-sm font-display font-bold shadow-lg shadow-cyan-900/30 hover:brightness-110 transition-all"
                >
                  {step === 3 ? 'Generate' : 'Next'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
