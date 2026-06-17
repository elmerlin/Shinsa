const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStepCuesFromChart,
  selectPresetChart,
  selectPresetSong,
} = require('./chartTiming');

describe('chart timing helper', () => {
  it('builds actionable single-panel cues from taps and hold heads only', () => {
    const cues = buildStepCuesFromChart({
      chartId: 42,
      mode: 'Single',
      level: 15,
      metadata: {
        bpms: [{ beat: 0, bpm: 120 }],
        stops: [],
      },
      chart: {
        notes: [
          { beat: 2, column: 4, type: 'hold_tail' },
          { beat: 0, column: 0, type: 'tap' },
          { beat: 1, column: 3, type: 'hold_head' },
          { beat: 1.5, column: 1, type: 'mine' },
          { beat: 2.5, column: 2, type: 'fake' },
        ],
      },
      beatToTimeFn: (beat) => beat * 0.5,
    });

    assert.deepEqual(cues, [
      {
        id: '42-0-0',
        chartId: 42,
        timeMs: 0,
        beat: 0,
        panel: 'bottomLeft',
      },
      {
        id: '42-1-3',
        chartId: 42,
        timeMs: 500,
        beat: 1,
        panel: 'topRight',
      },
    ]);
  });

  it('adds left/right pad sides for double charts', () => {
    const cues = buildStepCuesFromChart({
      chartId: 99,
      mode: 'Double',
      level: 20,
      metadata: {
        bpms: [{ beat: 0, bpm: 120 }],
        stops: [],
      },
      chart: {
        notes: [
          { beat: 0, column: 1, type: 'tap' },
          { beat: 0.5, column: 5, type: 'tap' },
          { beat: 1, column: 9, type: 'hold_head' },
        ],
      },
      beatToTimeFn: (beat) => beat,
    });

    assert.deepEqual(cues.map(({ panel, side }) => ({ panel, side })), [
      { panel: 'topLeft', side: 'left' },
      { panel: 'bottomLeft', side: 'right' },
      { panel: 'bottomRight', side: 'right' },
    ]);
  });

  it('matches preset song title variants and exact mode/level charts', () => {
    const manifest = {
      packs: [
        {
          name: 'PHOENIX',
          songs: [
            {
              title: '[Short Cut] Halloween Party ~Multiverse~',
              file: 'PHOENIX/[Short Cut] Halloween Party ~Multiverse~.ssc',
            },
          ],
        },
      ],
    };

    const song = selectPresetSong(manifest, {
      title: 'Halloween Party ~Multiverse~ - SHORT CUT -',
      artist: 'SHK',
      mode: 'Double',
      level: 21,
    });

    assert.equal(song.file, 'PHOENIX/[Short Cut] Halloween Party ~Multiverse~.ssc');

    const chart = selectPresetChart({
      charts: [
        { type: 'pump-single', meter: 21 },
        { type: 'pump-double', meter: 20 },
        { type: 'pump-double', meter: 21 },
      ],
    }, { mode: 'Double', level: 21 });

    assert.equal(chart.type, 'pump-double');
    assert.equal(chart.meter, 21);
  });

  it('matches stylized titles against compact plain catalog titles', () => {
    const manifest = {
      packs: [
        {
          name: 'PHOENIX',
          songs: [
            {
              title: '†DOOF†SENC†',
              file: 'PHOENIX/DOOFSENC.ssc',
            },
          ],
        },
      ],
    };

    const song = selectPresetSong(manifest, {
      title: 'DOOFSENC',
      artist: 'Kobaryo',
      mode: 'Single',
      level: 15,
    });

    assert.equal(song.file, 'PHOENIX/DOOFSENC.ssc');
  });
});
