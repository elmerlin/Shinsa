const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SCENARIO_DEFINITIONS,
  SKILL_CONCEPT_TAXONOMY,
  buildConceptFallbackIndex,
  buildEvidenceEntries,
  buildTrainingGapPayload,
  classifyBlockerState,
  computeConceptSupply,
  computeGapMetrics,
  getChartConceptDemand,
} = require('./trainingGap');

function makeChart({ chart_id, key, title, mode = 'Single', level, skills = [] }) {
  return {
    chart_id,
    key,
    title,
    artist: 'Tester',
    mode,
    level,
    jacket_url: '',
    bpm: '180',
    skills: skills.map((slug) => ({ slug, name: slug })),
  };
}

function makeRecord({ level, score, grade, is_pass = true, source = 'best' }) {
  return {
    level,
    score,
    grade,
    is_pass,
    source,
    date_played: '2026-04-01',
  };
}

describe('trainingGap skill taxonomy', () => {
  it('covers all 32 PIU Center skills with normalized concept weights', () => {
    assert.equal(Object.keys(SKILL_CONCEPT_TAXONOMY).length, 32);

    for (const mix of Object.values(SKILL_CONCEPT_TAXONOMY)) {
      const total = Object.values(mix).reduce((sum, value) => sum + value, 0);
      assert.ok(Math.abs(total - 1) < 0.0001, `skill mix should sum to 1, got ${total}`);
    }
  });
});

describe('trainingGap concept demand and evidence weighting', () => {
  it('falls back to the mode-level median for untagged charts', () => {
    const taggedA = makeChart({ chart_id: 1, key: 'a', title: 'A', level: 20, skills: ['run'] });
    const taggedB = makeChart({ chart_id: 2, key: 'b', title: 'B', level: 20, skills: ['sustained'] });
    const untagged = makeChart({ chart_id: 3, key: 'c', title: 'C', level: 20, skills: [] });
    const fallback = buildConceptFallbackIndex([taggedA, taggedB, untagged]);

    const demand = getChartConceptDemand(untagged, fallback);
    assert.equal(demand.source, 'mode_level_median');
    assert.ok(demand.mix.speed_reserve > 0);
    assert.ok(demand.mix.stamina_reserve > 0);
  });

  it('weights nearby shared-skill evidence more heavily than unrelated charts', () => {
    const selected = makeChart({ chart_id: 11, key: 'selected', title: 'Target', level: 20, skills: ['run'] });
    const shared = makeChart({ chart_id: 12, key: 'shared', title: 'Shared', level: 19, skills: ['run'] });
    const unrelated = makeChart({ chart_id: 13, key: 'unrelated', title: 'Unrelated', level: 19, skills: ['bracket'] });
    const fallback = buildConceptFallbackIndex([selected, shared, unrelated]);
    const bestByChart = new Map([
      ['shared', makeRecord({ level: 19, score: 960000, grade: 'AAA', is_pass: true })],
      ['unrelated', makeRecord({ level: 19, score: 960000, grade: 'AAA', is_pass: true })],
    ]);

    const evidence = buildEvidenceEntries({
      charts: [selected, shared, unrelated],
      bestByChart,
      targetLevel: 20,
      selectedChart: selected,
      fallbackIndex: fallback,
    });

    assert.equal(evidence[0].chart.key, 'shared');
    assert.ok(evidence[0].overlap_ratio > evidence[1].overlap_ratio);

    const supply = computeConceptSupply({
      profile: { play_days: 10, training_ratio: 100, avg_play_load: 650 },
      targetLevel: 20,
      selectedChart: selected,
      evidenceEntries: evidence,
      targetPassLoad: 585,
    });

    assert.ok(supply.supply.speed_reserve > supply.supply.movement_control);
  });
});

describe('trainingGap math', () => {
  it('computes base demand, economy tax, reserve, and pass margin from the approved formulas', () => {
    const derived = computeGapMetrics({
      targetLevel: 20,
      supply: {
        pattern_recognition: 80,
        movement_control: 60,
        speed_reserve: 50,
        stamina_reserve: 40,
      },
      demand: {
        pattern_recognition: 45,
        movement_control: 35,
        speed_reserve: 70,
        stamina_reserve: 60,
      },
      reserveInput: 1000,
      reserveSource: 'profile',
      trainingRatio: 100,
    });

    assert.equal(derived.pass_load, 585);
    assert.equal(derived.chart_physical_factor, 1.26);
    assert.equal(derived.base_demand, 735.93);
    assert.equal(derived.execution_economy, 71);
    assert.equal(derived.economy_tax, 106.71);
    assert.equal(derived.actual_demand, 842.64);
    assert.equal(derived.reserve, 1000);
    assert.equal(derived.pass_margin, 157.36);
    assert.equal(derived.blocker_state, 'ready');
  });

  it('classifies blocker state according to the approved thresholds', () => {
    assert.equal(classifyBlockerState({ actual_demand: 900, reserve: 950, physical_gap: 0, mental_gap_to_close: 0 }), 'ready');
    assert.equal(classifyBlockerState({ actual_demand: 1200, reserve: 800, physical_gap: 100, mental_gap_to_close: 260 }), 'mental');
    assert.equal(classifyBlockerState({ actual_demand: 1200, reserve: 800, physical_gap: 260, mental_gap_to_close: 100 }), 'physical');
    assert.equal(classifyBlockerState({ actual_demand: 1200, reserve: 800, physical_gap: 180, mental_gap_to_close: 160 }), 'mixed');
  });
});

describe('trainingGap payload behavior', () => {
  it('uses evidence_estimate reserve when the user is still calibrating', () => {
    const charts = [
      makeChart({ chart_id: 21, key: 'target-1', title: 'Target 1', level: 20, skills: ['run'] }),
      makeChart({ chart_id: 22, key: 'anchor', title: 'Anchor', level: 19, skills: ['run'] }),
    ];
    const payload = buildTrainingGapPayload({
      mode: 'Single',
      requestedLevel: 20,
      profile: {
        play_days: 3,
        training_ratio: null,
        avg_play_load: null,
        calibrating: true,
        training_status: 'Calibrating',
      },
      songCatalog: { charts, levels: [19, 20] },
      bestByChart: new Map([
        ['anchor', makeRecord({ level: 19, score: 955000, grade: 'AAA', is_pass: true })],
      ]),
    });

    assert.equal(payload.profile.analytics_avg_play_load_source, 'evidence_estimate');
    assert.ok(payload.derived.reserve > 0);
  });

  it('produces the scenario chips and keeps recognition buffs directionally positive', () => {
    const charts = [
      makeChart({ chart_id: 31, key: 'target-1', title: 'Target 1', level: 20, skills: ['run'] }),
      makeChart({ chart_id: 32, key: 'anchor', title: 'Anchor', level: 19, skills: ['run'] }),
    ];
    const payload = buildTrainingGapPayload({
      mode: 'Single',
      requestedLevel: 20,
      profile: {
        play_days: 11,
        training_ratio: 94,
        avg_play_load: 610,
        training_status: 'Cruising',
      },
      songCatalog: { charts, levels: [19, 20] },
      bestByChart: new Map([
        ['anchor', makeRecord({ level: 19, score: 920000, grade: 'AA+', is_pass: true })],
      ]),
    });

    assert.equal(payload.scenarios.length, SCENARIO_DEFINITIONS.length);
    const recognition = payload.scenarios.find((scenario) => scenario.key === 'recognition_plus_10');
    assert.ok(recognition.pass_margin_delta > 0);
  });
});
