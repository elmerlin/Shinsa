// Goal-based recommendation algorithms for /what-to-play.
// Title goal: bucketed fill order (easy-tier → high-fail → skill-fit → remaining)
// Pumbility goal: anchored selection with seeded frontier variety.

const { LEVEL_BASE_POINTS, getUserTitleProgress } = require('./titleProgress');
const { buildPumbilityCandidates } = require('./pumbilityCandidates');
const { makeChartKey } = require('./chartKeys');

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Efraimidis-Spirakis weighted reservoir sampling.
 * Returns `count` items chosen with probability proportional to weight.
 * Same seed always produces the same selection.
 */
function seededWeightedSample(items, weightFn, seed, count) {
  if (!items.length) return [];
  const rng = mulberry32(seed);
  const keyed = items.map((item) => ({
    item,
    key: -Math.log(rng()) / Math.max(weightFn(item), 0.001),
  }));
  keyed.sort((a, b) => a.key - b.key); // lower key = higher priority
  return keyed.slice(0, count).map((k) => k.item);
}

/**
 * Shuffle an array in-place using a seeded PRNG (Fisher-Yates).
 */
function seededShuffle(arr, seed) {
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Skill profile builder
// ---------------------------------------------------------------------------
/**
 * Build per-skill averages from the user's passed charts.
 * Returns Map<slug, { avg, rawAvg, name }> where:
 *   avg    = 0-1 normalized (for fit scoring)
 *   rawAvg = raw 0-1M scale (for reasoning text like "you average 940k")
 *   name   = human-readable skill name
 */
function buildSkillProfile(songCatalog, passBest) {
  const skillStats = new Map(); // slug → { totalScore, count, name }

  for (const chart of songCatalog.charts) {
    const best = passBest.get(chart.key);
    if (!best || !best.is_pass) continue;
    const score = parseInt(best.score, 10) || 0;
    if (score <= 0) continue;

    for (const skill of chart.skills || []) {
      const slug = skill.slug || skill.skill_slug;
      if (!slug) continue;
      const entry = skillStats.get(slug) || { totalScore: 0, count: 0, name: skill.name || slug };
      entry.totalScore += score;
      entry.count += 1;
      skillStats.set(slug, entry);
    }
  }

  const profile = new Map();
  for (const [slug, stats] of skillStats) {
    if (stats.count >= 2) {
      const rawAvg = stats.totalScore / stats.count;
      profile.set(slug, {
        avg: rawAvg / 1000000,
        rawAvg,
        name: stats.name,
      });
    }
  }
  return profile;
}

/**
 * Compute fit score + per-skill breakdown for a chart against the user's skill profile.
 * Returns { fitScore, matchedSkills: [{ name, slug, playerRawAvg }] }
 */
function computeFitBreakdown(chart, skillProfile) {
  const skills = chart.skills || [];
  if (!skills.length || !skillProfile.size) return { fitScore: 0.5, matchedSkills: [] };
  let total = 0;
  let matched = 0;
  const matchedSkills = [];
  for (const skill of skills) {
    const slug = skill.slug || skill.skill_slug;
    if (!slug) continue;
    const entry = skillProfile.get(slug);
    if (entry !== undefined) {
      total += entry.avg;
      matched += 1;
      matchedSkills.push({ name: entry.name, slug, playerRawAvg: entry.rawAvg });
    }
  }
  if (!matched) return { fitScore: 0.5, matchedSkills: [] };
  // Sort by strongest skill first
  matchedSkills.sort((a, b) => b.playerRawAvg - a.playerRawAvg);
  return { fitScore: total / matched, matchedSkills };
}

// ---------------------------------------------------------------------------
// Reasoning text builders
// ---------------------------------------------------------------------------
function formatScoreK(score) {
  return `${Math.round(score / 1000)}k`;
}

function skillNamesText(matchedSkills, max) {
  return matchedSkills.slice(0, max).map((s) => s.name).join(' and ');
}

function buildTitleReasoning(reasonType, { failScore, matchedSkills, tierName, chartSkillNames }) {
  const topSkills = (matchedSkills || []).slice(0, 2);
  switch (reasonType) {
    case 'easy_tier': {
      if (topSkills.length) {
        const avgK = formatScoreK(topSkills.reduce((s, sk) => s + sk.playerRawAvg, 0) / topSkills.length);
        return `Rated Easy. Features ${skillNamesText(topSkills, 2)} — you average ${avgK} on those.`;
      }
      return 'Rated Easy by the community.';
    }
    case 'high_fail': {
      const fk = formatScoreK(failScore);
      if (failScore >= 900000) return `You scored ${fk} on a fail — a strong sign you can clear this.`;
      if (failScore >= 850000) return `You scored ${fk} on a fail. A focused session could get you there.`;
      return `You scored ${fk} on a fail. Keep pushing.`;
    }
    case 'skill_fit': {
      if (topSkills.length) {
        const details = topSkills.map((s) => `${s.name} (avg ${formatScoreK(s.playerRawAvg)})`).join(', ');
        return `Matches your strengths: ${details}.`;
      }
      return 'Matches your skill profile.';
    }
    case 'unpassed': {
      if (tierName && tierName !== 'Unrated') return `${tierName} tier — no attempts yet.`;
      return 'Unplayed at your target level.';
    }
    default:
      return '';
  }
}

function buildPumbilityReasoning(reasonType, { scoreNeeded, nextGrade, pumbilityGain }) {
  const sk = scoreNeeded != null ? formatScoreK(scoreNeeded) : '?';
  switch (reasonType) {
    case 'easiest':
      return `Only ${sk} from ${nextGrade} — your lowest-effort upgrade.`;
    case 'best_impact':
      return `+${pumbilityGain} Pumbility for ${sk}. Best return on effort.`;
    case 'easiest_and_best_impact':
      return `Only ${sk} from ${nextGrade} and your best Pumbility return.`;
    case 'impact_ranked':
      return `+${pumbilityGain} Pumbility if you reach ${nextGrade}. ${sk} to go.`;
    default:
      return '';
  }
}

function getChartSkillNames(chart, max) {
  if (!chart || !chart.skills || !chart.skills.length) return [];
  return chart.skills.slice(0, max).map((s) => s.name || s.slug);
}

// ---------------------------------------------------------------------------
// Title Goal Recommendations
// ---------------------------------------------------------------------------
function buildTitleGoalRecommendations({
  db, userId, songCatalog, bestByChart, passBest, failBest, aliases, mode, seed, limit,
}) {
  const titleProgress = getUserTitleProgress(db, userId);

  if (!titleProgress.imported) {
    return {
      goal: 'title',
      mode,
      seed,
      status: 'needs_import',
      summary: null,
      recommendations: [],
    };
  }

  const { summary } = titleProgress;
  if (!summary || !summary.next_title) {
    return {
      goal: 'title',
      mode,
      seed,
      status: 'all_completed',
      summary: {
        current_title: summary?.current_title || null,
        next_title: null,
        points_remaining: 0,
        estimated_passes: 0,
        estimate_label: 'All titles completed',
      },
      recommendations: [],
    };
  }

  const targetLevel = summary.next_title.level;
  const pointsRemaining = summary.remaining_points_to_next_title || 0;
  const basePoints = LEVEL_BASE_POINTS[targetLevel] || 0;
  const estimatedPasses = basePoints > 0 ? Math.ceil(pointsRemaining / basePoints) : 0;

  // Filter catalog to target level + requested mode
  const modeNorm = mode === 'single' ? 'Single' : 'Double';
  const targetCharts = songCatalog.charts.filter(
    (c) => c.level === targetLevel && c.mode === modeNorm,
  );

  // Load tier data for target level + mode
  const tierMap = new Map(); // chart_id → { tier_name, tier_rank }
  try {
    const tierRows = db.prepare(`
      SELECT chart_id, tier_name, tier_rank
      FROM chart_tiers
      WHERE tier_list_type = 'Pass' AND mode = ? AND level = ?
    `).all(modeNorm, targetLevel);
    for (const row of tierRows) {
      tierMap.set(row.chart_id, { tier_name: row.tier_name, tier_rank: row.tier_rank });
    }
  } catch (_) { /* tier data optional */ }

  // Build skill profile for fit scoring
  const skillProfile = buildSkillProfile(songCatalog, passBest);

  // Build candidates: only unpassed charts
  const bucketA = []; // easy-tier unpassed
  const bucketB = []; // high fail score
  const bucketC = []; // skill-fit unpassed
  const bucketD = []; // remaining unpassed

  for (const chart of targetCharts) {
    const pass = passBest.get(chart.key);
    if (pass && pass.is_pass) continue; // already passed

    const fail = failBest.get(chart.key);
    const tier = tierMap.get(chart.chart_id);
    const { fitScore, matchedSkills } = computeFitBreakdown(chart, skillProfile);
    const failScore = fail ? (parseInt(fail.score, 10) || 0) : 0;
    const bestScore = pass ? (parseInt(pass.score, 10) || 0) : (fail ? failScore : null);
    const bestGrade = pass ? pass.grade : (fail ? fail.grade : null);
    const chartSkillNames = getChartSkillNames(chart, 3);
    const tierName = tier ? tier.tier_name : 'Unrated';

    const candidate = {
      chart_id: chart.chart_id,
      song_title: chart.title,
      artist: chart.artist || '',
      mode: chart.mode,
      level: chart.level,
      jacket_url: chart.jacket_url || '',
      tier_name: tierName,
      tier_rank: tier ? tier.tier_rank : 999,
      best_score: bestScore,
      best_grade: bestGrade,
      fail_score: failScore || null,
      is_pass: false,
      fit_score: Math.round(fitScore * 100) / 100,
      skills: chartSkillNames,
    };

    if (tier && tier.tier_rank <= 2) {
      candidate.reason_type = 'easy_tier';
      candidate.reason_label = 'Easy Tier';
      candidate.reasoning = buildTitleReasoning('easy_tier', { matchedSkills, chartSkillNames });
      bucketA.push(candidate);
    } else if (failScore > 0) {
      candidate.reason_type = 'high_fail';
      candidate.reason_label = `Failed ${Math.round(failScore / 1000)}k`;
      candidate.reasoning = buildTitleReasoning('high_fail', { failScore, matchedSkills, chartSkillNames });
      bucketB.push(candidate);
    } else if (fitScore > 0.7) {
      candidate.reason_type = 'skill_fit';
      candidate.reason_label = 'Best Match';
      candidate.reasoning = buildTitleReasoning('skill_fit', { matchedSkills, chartSkillNames });
      bucketC.push(candidate);
    } else {
      candidate.reason_type = 'unpassed';
      candidate.reason_label = tier ? tier.tier_name : 'Unplayed';
      candidate.reasoning = buildTitleReasoning('unpassed', { tierName, chartSkillNames });
      bucketD.push(candidate);
    }
  }

  // Bucket A: sub-sort by tier_rank asc, seeded shuffle within each sub-tier
  const tierGroups = new Map();
  for (const c of bucketA) {
    const rank = c.tier_rank;
    if (!tierGroups.has(rank)) tierGroups.set(rank, []);
    tierGroups.get(rank).push(c);
  }
  const sortedBucketA = [];
  for (const rank of [...tierGroups.keys()].sort((a, b) => a - b)) {
    const group = tierGroups.get(rank);
    seededShuffle(group, seed + rank);
    sortedBucketA.push(...group);
  }

  // Bucket B: strictly fail_score desc (no shuffle)
  bucketB.sort((a, b) => (b.fail_score || 0) - (a.fail_score || 0));

  // Bucket C: seeded shuffle (weighted by fit_score)
  const shuffledC = seededWeightedSample(
    bucketC, (c) => c.fit_score, seed + 100, bucketC.length,
  );

  // Bucket D: seeded shuffle
  seededShuffle(bucketD, seed + 200);

  // Fill from buckets in order
  const recommendations = [];
  const seen = new Set();
  const pushRows = (rows) => {
    for (const row of rows) {
      if (recommendations.length >= limit) break;
      if (seen.has(row.chart_id)) continue;
      seen.add(row.chart_id);
      recommendations.push(row);
    }
  };

  pushRows(sortedBucketA);
  pushRows(bucketB);
  pushRows(shuffledC);
  pushRows(bucketD);

  return {
    goal: 'title',
    mode,
    seed,
    status: 'ok',
    summary: {
      current_title: summary.current_title,
      next_title: summary.next_title,
      points_remaining: pointsRemaining,
      target_level: targetLevel,
      estimated_passes: estimatedPasses,
      estimate_label: `About ${estimatedPasses} ${modeNorm === 'Single' ? 'S' : 'D'}${targetLevel} clears at AA pace`,
    },
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Pumbility Goal Recommendations
// ---------------------------------------------------------------------------
function buildPumbilityGoalRecommendations({
  db, userId, bestScores, songCatalog, aliases, mode, seed, limit,
}) {
  const modeFilter = mode === 'single' ? 'Single' : '';
  const metric = mode === 'single' ? 'singles' : 'overall';

  const result = buildPumbilityCandidates(bestScores, { modeFilter, metric });
  const { candidates, baselinePumbility, pumbilityTopCount } = result;

  if (!candidates.length) {
    return {
      goal: 'pumbility',
      mode,
      seed,
      status: candidates.length === 0 && !bestScores.length ? 'needs_import' : 'no_candidates',
      summary: {
        current_pumbility: baselinePumbility,
        metric,
        frontier_size: 0,
        selection_note: 'No upgradeable charts found',
      },
      recommendations: [],
    };
  }

  // Pin anchor slots (same as piugame.js selection logic)
  const easiest = [...candidates].sort((a, b) => {
    if (a.score_needed !== b.score_needed) return a.score_needed - b.score_needed;
    if (b.pumbility_gain !== a.pumbility_gain) return b.pumbility_gain - a.pumbility_gain;
    return b.impact_per_point - a.impact_per_point;
  })[0];

  const bestEfficiency = [...candidates].sort((a, b) => {
    if (b.impact_per_point !== a.impact_per_point) return b.impact_per_point - a.impact_per_point;
    if (b.pumbility_gain !== a.pumbility_gain) return b.pumbility_gain - a.pumbility_gain;
    return a.score_needed - b.score_needed;
  })[0];

  const recommendations = [];
  const used = new Set();

  const enrichCandidate = (candidate, reasonType, reasonLabel) => {
    // Enrich with catalog data using alias-aware chart key
    const chartKey = makeChartKey(candidate.song_title, candidate.mode, candidate.level, aliases);
    const catalogChart = chartKey ? songCatalog.chartsByKey.get(chartKey) : null;

    return {
      chart_id: catalogChart ? catalogChart.chart_id : null,
      song_title: candidate.song_title,
      artist: catalogChart ? catalogChart.artist : '',
      mode: candidate.mode,
      level: candidate.level,
      jacket_url: catalogChart ? catalogChart.jacket_url : (candidate.background_url || ''),
      current_score: candidate.current_score,
      current_grade: candidate.current_grade,
      next_grade: candidate.next_grade,
      score_needed: candidate.score_needed,
      pumbility_gain: candidate.pumbility_gain,
      impact_per_point: candidate.impact_per_point,
      reason_type: reasonType,
      reason_label: reasonLabel,
      reasoning: buildPumbilityReasoning(reasonType, {
        scoreNeeded: candidate.score_needed,
        nextGrade: candidate.next_grade,
        pumbilityGain: candidate.pumbility_gain,
      }),
      skills: getChartSkillNames(catalogChart, 3),
    };
  };

  const pushCandidate = (candidate, reasonType, reasonLabel) => {
    if (!candidate || used.has(candidate._key)) return;
    used.add(candidate._key);
    recommendations.push(enrichCandidate(candidate, reasonType, reasonLabel));
  };

  // Pin easiest
  pushCandidate(easiest, 'easiest', 'Easiest Upgrade');
  // Pin best impact (merge label if same chart)
  if (bestEfficiency?._key === easiest?._key) {
    if (recommendations.length > 0) {
      recommendations[0].reason_type = 'easiest_and_best_impact';
      recommendations[0].reason_label = 'Easiest & Best Impact';
    }
  } else {
    pushCandidate(bestEfficiency, 'best_impact', 'Best Efficiency');
  }

  // Frontier fill: seeded weighted sample from remaining candidates
  const remaining = candidates.filter((c) => !used.has(c._key));
  const frontierCount = Math.max(0, limit - recommendations.length);
  const frontier = seededWeightedSample(
    remaining, (c) => c.impact_per_point, seed, frontierCount,
  );

  for (const c of frontier) {
    if (recommendations.length >= limit) break;
    pushCandidate(c, 'impact_ranked', 'High Impact');
  }

  return {
    goal: 'pumbility',
    mode,
    seed,
    status: 'ok',
    summary: {
      current_pumbility: baselinePumbility,
      metric,
      frontier_size: candidates.length,
      selection_note: 'Picked from near-optimal upgrade charts',
    },
    recommendations,
  };
}

module.exports = {
  buildTitleGoalRecommendations,
  buildPumbilityGoalRecommendations,
};
