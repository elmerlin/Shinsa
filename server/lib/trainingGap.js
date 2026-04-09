const { EXTENDED_BASE_POINTS } = require('./trainingLoad');
const { GRADE_MULTIPLIER, normalizeGrade, gradeFromScore } = require('./titleProgress');

const CONCEPT_KEYS = [
  'pattern_recognition',
  'movement_control',
  'speed_reserve',
  'stamina_reserve',
];

const DEFAULT_CONCEPT_MIX = {
  pattern_recognition: 54,
  movement_control: 52,
  speed_reserve: 56,
  stamina_reserve: 58,
};

const SKILL_CONCEPT_TAXONOMY = {
  jump: { pattern_recognition: 0.18, movement_control: 0.27, speed_reserve: 0.22, stamina_reserve: 0.33 },
  drill: { pattern_recognition: 0.12, movement_control: 0.10, speed_reserve: 0.38, stamina_reserve: 0.40 },
  run: { pattern_recognition: 0.16, movement_control: 0.14, speed_reserve: 0.38, stamina_reserve: 0.32 },
  anchor_run: { pattern_recognition: 0.18, movement_control: 0.22, speed_reserve: 0.30, stamina_reserve: 0.30 },
  run_without_twists: { pattern_recognition: 0.12, movement_control: 0.12, speed_reserve: 0.42, stamina_reserve: 0.34 },
  twist_90: { pattern_recognition: 0.22, movement_control: 0.34, speed_reserve: 0.18, stamina_reserve: 0.26 },
  twist_over90: { pattern_recognition: 0.24, movement_control: 0.38, speed_reserve: 0.16, stamina_reserve: 0.22 },
  twist_close: { pattern_recognition: 0.20, movement_control: 0.42, speed_reserve: 0.14, stamina_reserve: 0.24 },
  twist_far: { pattern_recognition: 0.22, movement_control: 0.34, speed_reserve: 0.18, stamina_reserve: 0.26 },
  side3_singles: { pattern_recognition: 0.24, movement_control: 0.34, speed_reserve: 0.22, stamina_reserve: 0.20 },
  mid6_doubles: { pattern_recognition: 0.18, movement_control: 0.32, speed_reserve: 0.24, stamina_reserve: 0.26 },
  mid4_doubles: { pattern_recognition: 0.18, movement_control: 0.30, speed_reserve: 0.24, stamina_reserve: 0.28 },
  doublestep: { pattern_recognition: 0.30, movement_control: 0.30, speed_reserve: 0.16, stamina_reserve: 0.24 },
  jack: { pattern_recognition: 0.14, movement_control: 0.12, speed_reserve: 0.38, stamina_reserve: 0.36 },
  footswitch: { pattern_recognition: 0.28, movement_control: 0.30, speed_reserve: 0.18, stamina_reserve: 0.24 },
  bracket: { pattern_recognition: 0.18, movement_control: 0.44, speed_reserve: 0.16, stamina_reserve: 0.22 },
  staggered_bracket: { pattern_recognition: 0.22, movement_control: 0.42, speed_reserve: 0.16, stamina_reserve: 0.20 },
  bracket_run: { pattern_recognition: 0.20, movement_control: 0.34, speed_reserve: 0.24, stamina_reserve: 0.22 },
  bracket_drill: { pattern_recognition: 0.18, movement_control: 0.36, speed_reserve: 0.20, stamina_reserve: 0.26 },
  bracket_jump: { pattern_recognition: 0.18, movement_control: 0.42, speed_reserve: 0.18, stamina_reserve: 0.22 },
  bracket_twist: { pattern_recognition: 0.24, movement_control: 0.42, speed_reserve: 0.12, stamina_reserve: 0.22 },
  '5-stair': { pattern_recognition: 0.30, movement_control: 0.28, speed_reserve: 0.22, stamina_reserve: 0.20 },
  '10-stair': { pattern_recognition: 0.26, movement_control: 0.28, speed_reserve: 0.22, stamina_reserve: 0.24 },
  yog_walk: { pattern_recognition: 0.28, movement_control: 0.34, speed_reserve: 0.16, stamina_reserve: 0.22 },
  'cross-pad_transition': { pattern_recognition: 0.18, movement_control: 0.44, speed_reserve: 0.18, stamina_reserve: 0.20 },
  'co-op_pad_transition': { pattern_recognition: 0.20, movement_control: 0.42, speed_reserve: 0.14, stamina_reserve: 0.24 },
  split: { pattern_recognition: 0.18, movement_control: 0.38, speed_reserve: 0.16, stamina_reserve: 0.28 },
  hold_footswitch: { pattern_recognition: 0.28, movement_control: 0.32, speed_reserve: 0.14, stamina_reserve: 0.26 },
  hold_footslide: { pattern_recognition: 0.20, movement_control: 0.40, speed_reserve: 0.12, stamina_reserve: 0.28 },
  hands: { pattern_recognition: 0.20, movement_control: 0.46, speed_reserve: 0.10, stamina_reserve: 0.24 },
  bursty: { pattern_recognition: 0.18, movement_control: 0.14, speed_reserve: 0.44, stamina_reserve: 0.24 },
  sustained: { pattern_recognition: 0.12, movement_control: 0.12, speed_reserve: 0.26, stamina_reserve: 0.50 },
};

const SCENARIO_DEFINITIONS = [
  {
    key: 'recognition_plus_10',
    label: '+10 recognition',
    description: 'Adds 10 points to pattern recognition.',
    delta: { pattern_recognition: 10 },
  },
  {
    key: 'fitness_plus_10',
    label: '+10 fitness',
    description: 'Adds 5 speed and 5 stamina reserve.',
    delta: { speed_reserve: 5, stamina_reserve: 5 },
  },
  {
    key: 'both_plus_10',
    label: '+10 both',
    description: 'Adds 10 recognition plus 5 speed and 5 stamina reserve.',
    delta: { pattern_recognition: 10, speed_reserve: 5, stamina_reserve: 5 },
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function createConceptZero() {
  return {
    pattern_recognition: 0,
    movement_control: 0,
    speed_reserve: 0,
    stamina_reserve: 0,
  };
}

function copyConcepts(source) {
  const next = createConceptZero();
  for (const key of CONCEPT_KEYS) {
    next[key] = Number(source?.[key] || 0);
  }
  return next;
}

function addConcepts(target, source, weight = 1) {
  for (const key of CONCEPT_KEYS) {
    target[key] += Number(source?.[key] || 0) * weight;
  }
  return target;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values
    .map((value) => Number(value || 0))
    .sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function getRecordGrade(record) {
  const score = parseInt(record?.score, 10) || 0;
  return normalizeGrade(record?.grade) || (score > 0 ? gradeFromScore(score) : 'F') || 'F';
}

function scoreToFailMultiplier(score) {
  const numericScore = parseInt(score, 10) || 0;
  if (numericScore <= 0) return 0.1;
  return clamp((numericScore / 500000) * 0.2, 0.1, 0.2);
}

function getRecordLoad(record) {
  const level = parseInt(record?.level, 10) || 0;
  const grade = getRecordGrade(record);
  const basePoints = EXTENDED_BASE_POINTS[level] || EXTENDED_BASE_POINTS[1];
  if (!record?.is_pass) {
    return round2(basePoints * scoreToFailMultiplier(record?.score));
  }
  const mult = GRADE_MULTIPLIER[grade] || GRADE_MULTIPLIER.A || 0.8;
  return round2(basePoints * mult);
}

function getChartSkillSet(chart) {
  return new Set(
    (Array.isArray(chart?.skills) ? chart.skills : [])
      .map((skill) => String(skill?.slug || '').trim())
      .filter(Boolean)
  );
}

function getSkillOverlapRatio(selectedSkills, candidateSkills) {
  if (!selectedSkills.size || !candidateSkills.size) return 0;
  let shared = 0;
  for (const slug of candidateSkills) {
    if (selectedSkills.has(slug)) shared += 1;
  }
  return shared / selectedSkills.size;
}

function getDirectConceptMixFromSkills(skills) {
  const direct = (Array.isArray(skills) ? skills : [])
    .map((skill) => SKILL_CONCEPT_TAXONOMY[String(skill?.slug || '').trim()])
    .filter(Boolean);

  if (direct.length === 0) return null;

  const mix = createConceptZero();
  for (const row of direct) {
    addConcepts(mix, row);
  }

  const densityBoost = clamp(0.88 + (direct.length * 0.04), 0.88, 1.12);
  const normalized = createConceptZero();
  for (const key of CONCEPT_KEYS) {
    normalized[key] = clamp((mix[key] / direct.length) * densityBoost * 100, 0, 100);
  }
  return normalized;
}

function buildConceptFallbackIndex(charts) {
  const taggedCharts = [];
  const byModeLevel = new Map();
  const byMode = new Map();

  for (const chart of Array.isArray(charts) ? charts : []) {
    const direct = getDirectConceptMixFromSkills(chart?.skills);
    if (!direct) continue;

    taggedCharts.push(direct);
    const mode = String(chart?.mode || '').trim();
    const level = parseInt(chart?.level, 10) || 0;
    const modeLevelKey = `${mode}|${level}`;
    if (!byModeLevel.has(modeLevelKey)) byModeLevel.set(modeLevelKey, []);
    if (!byMode.has(mode)) byMode.set(mode, []);
    byModeLevel.get(modeLevelKey).push(direct);
    byMode.get(mode).push(direct);
  }

  const serializeMedian = (list) => {
    if (!list.length) return null;
    const mix = createConceptZero();
    for (const key of CONCEPT_KEYS) {
      mix[key] = round2(median(list.map((row) => row[key])));
    }
    return mix;
  };

  return {
    global: serializeMedian(taggedCharts) || copyConcepts(DEFAULT_CONCEPT_MIX),
    byModeLevel: new Map(
      Array.from(byModeLevel.entries()).map(([key, rows]) => [key, serializeMedian(rows)])
    ),
    byMode: new Map(
      Array.from(byMode.entries()).map(([key, rows]) => [key, serializeMedian(rows)])
    ),
  };
}

function getChartConceptDemand(chart, fallbackIndex) {
  const direct = getDirectConceptMixFromSkills(chart?.skills);
  if (direct) {
    return {
      mix: direct,
      source: 'chart_skills',
      tagged: true,
    };
  }

  const mode = String(chart?.mode || '').trim();
  const level = parseInt(chart?.level, 10) || 0;
  const modeLevelKey = `${mode}|${level}`;
  const fallback = fallbackIndex?.byModeLevel?.get(modeLevelKey)
    || fallbackIndex?.byMode?.get(mode)
    || fallbackIndex?.global
    || copyConcepts(DEFAULT_CONCEPT_MIX);

  return {
    mix: copyConcepts(fallback),
    source: fallbackIndex?.byModeLevel?.has(modeLevelKey)
      ? 'mode_level_median'
      : fallbackIndex?.byMode?.has(mode)
        ? 'mode_median'
        : 'global_default',
    tagged: false,
  };
}

function deriveExecutionEconomy(supply) {
  return round2((Number(supply?.pattern_recognition || 0) * 0.55) + (Number(supply?.movement_control || 0) * 0.45));
}

function deriveEffectiveTime(supply) {
  const signal = (Number(supply?.pattern_recognition || 0) * 0.7) + (Number(supply?.movement_control || 0) * 0.3);
  return round2(clamp(34 + (signal * 0.66), 0, 100));
}

function classifyBlockerState({ actual_demand, reserve, physical_gap, mental_gap_to_close }) {
  if (Number(actual_demand || 0) <= Number(reserve || 0)) return 'ready';

  const physicalGap = Math.max(0, Number(physical_gap || 0));
  const mentalGap = Math.max(0, Number(mental_gap_to_close || 0));

  if (mentalGap >= (1.25 * physicalGap)) return 'mental';
  if (physicalGap >= (1.25 * mentalGap)) return 'physical';
  return 'mixed';
}

function resolveTargetLevel({ requestedLevel = null, profile = null, modeLevels = [], bestByChart = new Map() }) {
  if (modeLevels.length === 0) return requestedLevel || 1;

  let target = requestedLevel;

  if (!target) {
    target = parseInt(profile?.likely_pass?.level, 10) || 0;
  }
  if (!target) {
    const comfortableLevel = parseInt(profile?.comfortable_level, 10) || 0;
    if (comfortableLevel > 0) target = comfortableLevel + 1;
  }
  if (!target) {
    let highestSeen = 0;
    for (const record of bestByChart.values()) {
      highestSeen = Math.max(highestSeen, parseInt(record?.level, 10) || 0);
    }
    if (highestSeen > 0) target = highestSeen;
  }
  if (!target) {
    target = modeLevels[Math.floor(modeLevels.length / 2)] || modeLevels[0];
  }

  if (modeLevels.includes(target)) return target;

  return modeLevels.reduce((closest, level) => {
    if (closest == null) return level;
    return Math.abs(level - target) < Math.abs(closest - target) ? level : closest;
  }, modeLevels[0]);
}

function estimateAveragePlayLoad({ profile = null, evidenceRecords = [], targetLevel = 1 }) {
  if (Number.isFinite(profile?.avg_play_load) && profile.avg_play_load > 0) {
    return {
      value: Number(profile.avg_play_load),
      source: 'profile',
    };
  }

  const passLoads = [];
  for (const entry of evidenceRecords) {
    if (!entry?.record) continue;
    passLoads.push(getRecordLoad(entry.record));
  }

  if (passLoads.length > 0) {
    return {
      value: round2(passLoads.reduce((sum, load) => sum + load, 0) / passLoads.length),
      source: 'evidence_estimate',
    };
  }

  const fallbackLevel = Math.max(1, targetLevel - 1);
  return {
    value: round2((EXTENDED_BASE_POINTS[fallbackLevel] || EXTENDED_BASE_POINTS[1]) * (GRADE_MULTIPLIER['A+'] || 0.9)),
    source: 'fallback_estimate',
  };
}

function computeRecentLoadBlend({ profile = null, passLoad = 0 }) {
  const playDays = clamp(profile?.play_days, 0, 28);
  const rawRatio = Number.isFinite(profile?.training_ratio) ? Number(profile.training_ratio) : 100;
  const effectiveRatio = clamp(rawRatio, 75, 120);
  const avgLoad = Number(profile?.avg_play_load || 0);
  const normalizedLoadSupport = passLoad > 0
    ? clamp((avgLoad / passLoad) * 100, 0, 100)
    : clamp(avgLoad / 10, 0, 100);
  const repetitionScore = clamp((playDays / 12) * 100, 0, 100);
  const physical = round2(clamp((normalizedLoadSupport * 0.7) + (effectiveRatio * 0.3), 0, 100));
  const mental = round2(clamp((repetitionScore * 0.55) + (normalizedLoadSupport * 0.45), 0, 100));

  return {
    physical,
    mental,
    effective_training_ratio: effectiveRatio,
    ratio_source: Number.isFinite(profile?.training_ratio) ? 'profile' : 'neutral_estimate',
  };
}

function buildEvidenceEntries({
  charts = [],
  bestByChart = new Map(),
  targetLevel = 1,
  selectedChart = null,
  fallbackIndex = null,
}) {
  const selectedSkills = getChartSkillSet(selectedChart);
  const evidence = [];

  for (const chart of charts) {
    const level = parseInt(chart?.level, 10) || 0;
    if (level < Math.max(1, targetLevel - 3) || level > targetLevel) continue;

    const record = bestByChart.get(chart.key) || null;
    if (!record) continue;

    const demand = getChartConceptDemand(chart, fallbackIndex);
    const candidateSkills = getChartSkillSet(chart);
    const overlapRatio = getSkillOverlapRatio(selectedSkills, candidateSkills);
    const levelWeight = clamp(1 - ((targetLevel - level) * 0.14), 0.56, 1);
    const performance = record.is_pass
      ? clamp((Number(record.score || 0) / 1000000), 0.45, 1.0)
      : clamp((Number(record.score || 0) / 1000000) * 0.78, 0.16, 0.72);
    const levelRatioScore = clamp((level / Math.max(targetLevel, 1)) * 100, 45, 100);
    const overlapWeight = 1 + (overlapRatio * 0.65);
    const resultWeight = record.is_pass ? 1.05 : 0.82;
    const totalWeight = round2(levelWeight * overlapWeight * resultWeight);

    const conceptSignal = createConceptZero();
    for (const key of CONCEPT_KEYS) {
      const mixValue = Number(demand.mix?.[key] || 0);
      conceptSignal[key] = round2(((mixValue * 0.62) + (levelRatioScore * 0.38)) * performance);
    }

    evidence.push({
      chart,
      record,
      demand,
      overlap_ratio: round2(overlapRatio),
      overlap_weight: round2(overlapWeight),
      level_weight: round2(levelWeight),
      performance: round2(performance),
      total_weight: totalWeight,
      concept_signal: conceptSignal,
    });
  }

  return evidence.sort((a, b) => b.total_weight - a.total_weight);
}

function computeConceptSupply({
  profile = null,
  targetLevel = 1,
  selectedChart = null,
  evidenceEntries = [],
  targetPassLoad = 0,
}) {
  const weighted = createConceptZero();
  let weightTotal = 0;

  for (const entry of evidenceEntries) {
    weightTotal += entry.total_weight;
    addConcepts(weighted, entry.concept_signal, entry.total_weight);
  }

  const evidenceSupply = createConceptZero();
  for (const key of CONCEPT_KEYS) {
    evidenceSupply[key] = weightTotal > 0
      ? round2(clamp(weighted[key] / weightTotal, 0, 100))
      : 0;
  }

  const loadBlend = computeRecentLoadBlend({ profile, passLoad: targetPassLoad });
  const blended = createConceptZero();

  blended.pattern_recognition = round2(clamp((evidenceSupply.pattern_recognition * 0.78) + (loadBlend.mental * 0.22), 0, 100));
  blended.movement_control = round2(clamp((evidenceSupply.movement_control * 0.74) + (((loadBlend.mental * 0.6) + (loadBlend.physical * 0.4)) * 0.26), 0, 100));
  blended.speed_reserve = round2(clamp((evidenceSupply.speed_reserve * 0.58) + (loadBlend.physical * 0.42), 0, 100));
  blended.stamina_reserve = round2(clamp((evidenceSupply.stamina_reserve * 0.52) + (loadBlend.physical * 0.48), 0, 100));

  return {
    supply: blended,
    evidence_supply: evidenceSupply,
    load_blend: loadBlend,
    execution_economy: deriveExecutionEconomy(blended),
    effective_time: deriveEffectiveTime(blended),
    selected_chart_skill_count: getChartSkillSet(selectedChart).size,
  };
}

function computeGapMetrics({
  targetLevel = 1,
  supply = null,
  demand = null,
  reserveInput = null,
  reserveSource = 'profile',
  trainingRatio = 100,
}) {
  const passLoad = round2((EXTENDED_BASE_POINTS[targetLevel] || EXTENDED_BASE_POINTS[1]) * (GRADE_MULTIPLIER['A+'] || 0.9));
  const speedDemandNorm = clamp((Number(demand?.speed_reserve || 0) / 100), 0, 1);
  const staminaDemandNorm = clamp((Number(demand?.stamina_reserve || 0) / 100), 0, 1);
  const chartPhysicalFactorRaw = 1 + (0.18 * speedDemandNorm) + (0.22 * staminaDemandNorm);
  const chartPhysicalFactor = round2(chartPhysicalFactorRaw);
  const baseDemand = round2(passLoad * chartPhysicalFactorRaw);
  const executionEconomy = deriveExecutionEconomy(supply);
  const executionEconomyNorm = clamp(executionEconomy / 100, 0, 1);
  const economyTax = round2(baseDemand * (1 - executionEconomyNorm) * 0.5);
  const actualDemand = round2(baseDemand + economyTax);
  const reserve = round2(Number(reserveInput || 0) * clamp(Number(trainingRatio || 100) / 100, 0.75, 1.2));
  const passMargin = round2(reserve - actualDemand);
  const physicalGap = round2(Math.max(0, baseDemand - reserve));
  const mentalGapToClose = round2(Math.max(0, actualDemand - reserve) - physicalGap);
  const blockerState = classifyBlockerState({
    actual_demand: actualDemand,
    reserve,
    physical_gap: physicalGap,
    mental_gap_to_close: mentalGapToClose,
  });

  return {
    pass_load: passLoad,
    chart_physical_factor: chartPhysicalFactor,
    base_demand: baseDemand,
    economy_tax: economyTax,
    actual_demand: actualDemand,
    reserve,
    reserve_source: reserveSource,
    pass_margin: passMargin,
    physical_gap: physicalGap,
    mental_gap_to_close: mentalGapToClose,
    blocker_state: blockerState,
    execution_economy: executionEconomy,
    execution_economy_norm: round2(executionEconomyNorm),
    effective_time: deriveEffectiveTime(supply),
    irreducibly_physical: baseDemand,
    economy_debt: economyTax,
    training_ratio_used: round2(trainingRatio),
  };
}

function applyConceptDelta(baseSupply, delta) {
  const next = copyConcepts(baseSupply);
  for (const key of CONCEPT_KEYS) {
    next[key] = round2(clamp(next[key] + Number(delta?.[key] || 0), 0, 100));
  }
  return next;
}

function buildScenarioOutputs({
  baseSupply = null,
  demand = null,
  targetLevel = 1,
  reserveInput = 0,
  reserveSource = 'profile',
  trainingRatio = 100,
}) {
  const baseline = computeGapMetrics({
    targetLevel,
    supply: baseSupply,
    demand,
    reserveInput,
    reserveSource,
    trainingRatio,
  });

  return SCENARIO_DEFINITIONS.map((scenario) => {
    const supply = applyConceptDelta(baseSupply, scenario.delta);
    const derived = computeGapMetrics({
      targetLevel,
      supply,
      demand,
      reserveInput,
      reserveSource,
      trainingRatio,
    });

    return {
      key: scenario.key,
      label: scenario.label,
      description: scenario.description,
      delta: copyConcepts(scenario.delta),
      concepts: supply,
      derived,
      pass_margin_delta: round2(derived.pass_margin - baseline.pass_margin),
    };
  });
}

function summarizeSelectedChart(selectedChart, bestRecord, demandProfile) {
  return {
    chart_id: selectedChart.chart_id,
    key: selectedChart.key,
    title: selectedChart.title,
    artist: selectedChart.artist || '',
    mode: selectedChart.mode,
    level: selectedChart.level,
    jacket_url: selectedChart.jacket_url || '',
    bpm: selectedChart.bpm || '',
    best_record: bestRecord ? {
      score: parseInt(bestRecord.score, 10) || 0,
      grade: getRecordGrade(bestRecord),
      source: bestRecord.source || '',
      is_pass: !!bestRecord.is_pass,
      date_played: bestRecord.date_played || '',
    } : null,
    skills: Array.isArray(selectedChart.skills) ? selectedChart.skills.map((skill) => ({
      slug: String(skill?.slug || ''),
      name: String(skill?.name || skill?.slug || ''),
    })) : [],
    demand: {
      ...copyConcepts(demandProfile.mix),
      source: demandProfile.source,
      tagged: !!demandProfile.tagged,
    },
  };
}

function buildChartSnapshot({
  chart,
  bestByChart,
  fallbackIndex,
  profile,
  charts,
  targetLevel,
}) {
  const record = bestByChart.get(chart.key) || null;
  const demandProfile = getChartConceptDemand(chart, fallbackIndex);
  const evidenceEntries = buildEvidenceEntries({
    charts,
    bestByChart,
    targetLevel,
    selectedChart: chart,
    fallbackIndex,
  });
  const avgPlayLoad = estimateAveragePlayLoad({
    profile,
    evidenceRecords: evidenceEntries,
    targetLevel,
  });
  const trainingRatio = Number.isFinite(profile?.training_ratio) ? Number(profile.training_ratio) : 100;
  const concepts = computeConceptSupply({
    profile,
    targetLevel,
    selectedChart: chart,
    evidenceEntries,
    targetPassLoad: (EXTENDED_BASE_POINTS[targetLevel] || EXTENDED_BASE_POINTS[1]) * (GRADE_MULTIPLIER['A+'] || 0.9),
  });
  const derived = computeGapMetrics({
    targetLevel,
    supply: concepts.supply,
    demand: demandProfile.mix,
    reserveInput: avgPlayLoad.value,
    reserveSource: avgPlayLoad.source,
    trainingRatio,
  });

  return {
    chart_id: chart.chart_id,
    key: chart.key,
    title: chart.title,
    artist: chart.artist || '',
    mode: chart.mode,
    level: chart.level,
    jacket_url: chart.jacket_url || '',
    bpm: chart.bpm || '',
    skills: Array.isArray(chart.skills) ? chart.skills.map((skill) => ({
      slug: String(skill?.slug || ''),
      name: String(skill?.name || skill?.slug || ''),
    })) : [],
    best_record: record ? {
      score: parseInt(record.score, 10) || 0,
      grade: getRecordGrade(record),
      source: record.source || '',
      is_pass: !!record.is_pass,
      date_played: record.date_played || '',
    } : null,
    demand: {
      ...copyConcepts(demandProfile.mix),
      source: demandProfile.source,
      tagged: !!demandProfile.tagged,
    },
    concepts,
    derived,
    modeled_deficit: round2(Math.max(0, derived.actual_demand - derived.reserve)),
    is_unplayed: !record,
  };
}

function pickDefaultChart(charts) {
  if (!charts.length) return null;
  const allUnplayed = charts.every((chart) => chart.is_unplayed);
  if (allUnplayed) {
    const ordered = charts.slice().sort((a, b) => a.derived.actual_demand - b.derived.actual_demand);
    return ordered[Math.floor(ordered.length / 2)] || ordered[0];
  }

  return charts
    .slice()
    .sort((a, b) => {
      if (b.modeled_deficit !== a.modeled_deficit) return b.modeled_deficit - a.modeled_deficit;
      return b.derived.economy_tax - a.derived.economy_tax;
    })[0];
}

function buildNearbyLevels(modeLevels, targetLevel, chartsByLevel) {
  return modeLevels.map((level) => ({
    level,
    chart_count: chartsByLevel.get(level) || 0,
    is_target: level === targetLevel,
    is_nearby: Math.abs(level - targetLevel) <= 3,
  }));
}

function buildTrainingGapPayload({
  mode,
  requestedLevel = null,
  requestedChartId = null,
  profile = null,
  songCatalog = null,
  bestByChart = new Map(),
}) {
  const charts = Array.isArray(songCatalog?.charts) ? songCatalog.charts.filter((chart) => chart.mode === mode) : [];
  const fallbackIndex = buildConceptFallbackIndex(charts);
  const modeLevels = Array.isArray(songCatalog?.levels)
    ? songCatalog.levels
        .map((level) => parseInt(level, 10) || 0)
        .filter((level) => level > 0)
        .sort((a, b) => a - b)
    : [];

  const targetLevel = resolveTargetLevel({
    requestedLevel,
    profile,
    modeLevels,
    bestByChart,
  });

  const targetCharts = charts.filter((chart) => (parseInt(chart.level, 10) || 0) === targetLevel);
  const chartSnapshots = targetCharts.map((chart) => buildChartSnapshot({
    chart,
    bestByChart,
    fallbackIndex,
    profile,
    charts,
    targetLevel,
  }));
  const defaultChart = pickDefaultChart(chartSnapshots);
  const selectedChartSnapshot = chartSnapshots.find((chart) => chart.chart_id === parseInt(requestedChartId, 10))
    || defaultChart
    || null;
  const selectedChart = selectedChartSnapshot
    ? targetCharts.find((chart) => chart.chart_id === selectedChartSnapshot.chart_id) || null
    : null;

  if (!selectedChart || !selectedChartSnapshot) {
    return {
      profile: profile ? { ...profile } : {},
      selection: {
        mode: String(mode || '').toLowerCase(),
        target_level: targetLevel,
        chart_id: null,
        default_chart_id: null,
        selectable_levels: buildNearbyLevels(modeLevels, targetLevel, new Map()),
        chart: null,
      },
      concepts: {
        supply: copyConcepts(DEFAULT_CONCEPT_MIX),
        evidence_supply: createConceptZero(),
        demand: copyConcepts(DEFAULT_CONCEPT_MIX),
        gaps: createConceptZero(),
        execution_economy: deriveExecutionEconomy(DEFAULT_CONCEPT_MIX),
        effective_time: deriveEffectiveTime(DEFAULT_CONCEPT_MIX),
        load_blend: computeRecentLoadBlend({ profile, passLoad: 0 }),
      },
      derived: {
        pass_load: 0,
        chart_physical_factor: 1,
        base_demand: 0,
        economy_tax: 0,
        actual_demand: 0,
        reserve: 0,
        reserve_source: 'fallback_estimate',
        pass_margin: 0,
        physical_gap: 0,
        mental_gap_to_close: 0,
        blocker_state: 'mixed',
        execution_economy: deriveExecutionEconomy(DEFAULT_CONCEPT_MIX),
        execution_economy_norm: round2(deriveExecutionEconomy(DEFAULT_CONCEPT_MIX) / 100),
        effective_time: deriveEffectiveTime(DEFAULT_CONCEPT_MIX),
        irreducibly_physical: 0,
        economy_debt: 0,
        training_ratio_used: 100,
      },
      charts: [],
      evidence: {
        best_scores: [],
        recent_load: {
          active_days: clamp(profile?.play_days, 0, 56),
          training_status: profile?.training_status || 'Idle',
          training_ratio: Number.isFinite(profile?.training_ratio) ? Number(profile.training_ratio) : null,
          avg_play_load: Number.isFinite(profile?.avg_play_load) ? Number(profile.avg_play_load) : null,
          analytics_avg_play_load: null,
          analytics_avg_play_load_source: 'fallback_estimate',
          note: 'No chart-level evidence found for this level yet.',
        },
      },
      scenarios: [],
      target_level: targetLevel,
      default_chart_id: null,
      blocker_state: 'mixed',
    };
  }

  const selectedDemand = getChartConceptDemand(selectedChart, fallbackIndex);
  const evidenceEntries = buildEvidenceEntries({
    charts,
    bestByChart,
    targetLevel,
    selectedChart,
    fallbackIndex,
  });
  const reserveEstimate = estimateAveragePlayLoad({
    profile,
    evidenceRecords: evidenceEntries,
    targetLevel,
  });
  const trainingRatio = Number.isFinite(profile?.training_ratio) ? Number(profile.training_ratio) : 100;
  const conceptModel = computeConceptSupply({
    profile,
    targetLevel,
    selectedChart,
    evidenceEntries,
    targetPassLoad: (EXTENDED_BASE_POINTS[targetLevel] || EXTENDED_BASE_POINTS[1]) * (GRADE_MULTIPLIER['A+'] || 0.9),
  });
  const derived = computeGapMetrics({
    targetLevel,
    supply: conceptModel.supply,
    demand: selectedDemand.mix,
    reserveInput: reserveEstimate.value,
    reserveSource: reserveEstimate.source,
    trainingRatio,
  });

  const conceptGaps = createConceptZero();
  for (const key of CONCEPT_KEYS) {
    conceptGaps[key] = round2(Number(selectedDemand.mix?.[key] || 0) - Number(conceptModel.supply?.[key] || 0));
  }

  const selectableLevelCounts = new Map();
  for (const chart of charts) {
    const level = parseInt(chart.level, 10) || 0;
    selectableLevelCounts.set(level, (selectableLevelCounts.get(level) || 0) + 1);
  }

  const evidencePayload = evidenceEntries.slice(0, 8).map((entry) => ({
    chart_id: entry.chart.chart_id,
    title: entry.chart.title,
    mode: entry.chart.mode,
    level: entry.chart.level,
    jacket_url: entry.chart.jacket_url || '',
    skills: Array.isArray(entry.chart.skills) ? entry.chart.skills.map((skill) => ({
      slug: String(skill?.slug || ''),
      name: String(skill?.name || skill?.slug || ''),
    })) : [],
    best_record: {
      score: parseInt(entry.record.score, 10) || 0,
      grade: getRecordGrade(entry.record),
      source: entry.record.source || '',
      is_pass: !!entry.record.is_pass,
      date_played: entry.record.date_played || '',
    },
    overlap_ratio: entry.overlap_ratio,
    total_weight: entry.total_weight,
    concept_signal: copyConcepts(entry.concept_signal),
  }));

  const scenarios = buildScenarioOutputs({
    baseSupply: conceptModel.supply,
    demand: selectedDemand.mix,
    targetLevel,
    reserveInput: reserveEstimate.value,
    reserveSource: reserveEstimate.source,
    trainingRatio,
  });

  const profilePayload = {
    ...(profile || {}),
    analytics_avg_play_load: round2(reserveEstimate.value),
    analytics_avg_play_load_source: reserveEstimate.source,
    analytics_training_ratio: round2(trainingRatio),
    analytics_training_ratio_source: Number.isFinite(profile?.training_ratio) ? 'profile' : 'neutral_estimate',
  };

  return {
    profile: profilePayload,
    selection: {
      mode: String(mode || '').trim().toLowerCase(),
      target_level: targetLevel,
      chart_id: selectedChartSnapshot.chart_id,
      default_chart_id: defaultChart?.chart_id || selectedChartSnapshot.chart_id,
      selectable_levels: buildNearbyLevels(modeLevels, targetLevel, selectableLevelCounts),
      chart: summarizeSelectedChart(selectedChart, bestByChart.get(selectedChart.key) || null, selectedDemand),
    },
    concepts: {
      supply: copyConcepts(conceptModel.supply),
      evidence_supply: copyConcepts(conceptModel.evidence_supply),
      demand: copyConcepts(selectedDemand.mix),
      gaps: conceptGaps,
      execution_economy: conceptModel.execution_economy,
      effective_time: conceptModel.effective_time,
      load_blend: conceptModel.load_blend,
    },
    derived,
    charts: chartSnapshots.map((chart) => ({
      ...chart,
      is_selected: chart.chart_id === selectedChartSnapshot.chart_id,
    })),
    evidence: {
      best_scores: evidencePayload,
      recent_load: {
        active_days: clamp(profile?.play_days, 0, 56),
        training_status: profile?.training_status || 'Idle',
        training_ratio: Number.isFinite(profile?.training_ratio) ? Number(profile.training_ratio) : null,
        avg_play_load: Number.isFinite(profile?.avg_play_load) ? Number(profile.avg_play_load) : null,
        analytics_avg_play_load: round2(reserveEstimate.value),
        analytics_avg_play_load_source: reserveEstimate.source,
        note: evidencePayload.length > 0
          ? 'Nearby best scores anchor the concept estimates, while recent load reinforces speed and stamina reserve.'
          : 'No nearby best-score evidence was found, so estimates lean more heavily on recent load and level baselines.',
      },
    },
    scenarios,
    target_level: targetLevel,
    default_chart_id: defaultChart?.chart_id || selectedChartSnapshot.chart_id,
    blocker_state: derived.blocker_state,
  };
}

module.exports = {
  CONCEPT_KEYS,
  DEFAULT_CONCEPT_MIX,
  SCENARIO_DEFINITIONS,
  SKILL_CONCEPT_TAXONOMY,
  applyConceptDelta,
  buildConceptFallbackIndex,
  buildEvidenceEntries,
  buildScenarioOutputs,
  buildTrainingGapPayload,
  classifyBlockerState,
  computeConceptSupply,
  computeGapMetrics,
  deriveEffectiveTime,
  deriveExecutionEconomy,
  estimateAveragePlayLoad,
  getChartConceptDemand,
  getDirectConceptMixFromSkills,
  getRecordLoad,
  resolveTargetLevel,
};
