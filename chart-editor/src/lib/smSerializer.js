/**
 * StepMania .sm file serializer.
 * Converts structured chart data back to .sm file format.
 */

const TYPE_TO_CHAR = {
  tap: '1',
  hold_head: '2',
  hold_tail: '3',
  roll_head: '4',
  mine: 'M',
  fake: 'F',
  lift: 'L',
};

/**
 * Serialize chart data to .sm file string.
 * @param {{ metadata: object, charts: Array }} data
 * @returns {string}
 */
export function serializeSM(data) {
  const { metadata, charts } = data;
  const lines = [];

  // Write metadata tags
  lines.push(`#TITLE:${metadata.title || ''};`);
  if (metadata.subtitle) lines.push(`#SUBTITLE:${metadata.subtitle};`);
  lines.push(`#ARTIST:${metadata.artist || ''};`);
  if (metadata.titletranslit) lines.push(`#TITLETRANSLIT:${metadata.titletranslit};`);
  if (metadata.subtitletranslit) lines.push(`#SUBTITLETRANSLIT:${metadata.subtitletranslit};`);
  if (metadata.artisttranslit) lines.push(`#ARTISTTRANSLIT:${metadata.artisttranslit};`);
  if (metadata.genre) lines.push(`#GENRE:${metadata.genre};`);
  if (metadata.credit) lines.push(`#CREDIT:${metadata.credit};`);
  if (metadata.banner) lines.push(`#BANNER:${metadata.banner};`);
  if (metadata.background) lines.push(`#BACKGROUND:${metadata.background};`);
  if (metadata.lyricspath) lines.push(`#LYRICSPATH:${metadata.lyricspath};`);
  if (metadata.cdtitle) lines.push(`#CDTITLE:${metadata.cdtitle};`);
  lines.push(`#MUSIC:${metadata.music || ''};`);
  lines.push(`#OFFSET:${formatFloat(metadata.offset || 0)};`);
  lines.push(`#SAMPLESTART:${formatFloat(metadata.samplestart || 0)};`);
  lines.push(`#SAMPLELENGTH:${formatFloat(metadata.samplelength || 0)};`);
  if (metadata.selectable !== undefined) lines.push(`#SELECTABLE:${metadata.selectable};`);

  // BPMs
  const bpmStr = (metadata.bpms || [{ beat: 0, bpm: 120 }])
    .map(b => `${formatFloat(b.beat)}=${formatFloat(b.bpm)}`)
    .join(',\n');
  lines.push(`#BPMS:${bpmStr};`);

  // Stops
  if (metadata.stops && metadata.stops.length > 0) {
    const stopStr = metadata.stops
      .map(s => `${formatFloat(s.beat)}=${formatFloat(s.duration)}`)
      .join(',\n');
    lines.push(`#STOPS:${stopStr};`);
  } else {
    lines.push(`#STOPS:;`);
  }

  // Charts
  for (const chart of charts) {
    lines.push('');
    lines.push(serializeChart(chart));
  }

  return lines.join('\n') + '\n';
}

/**
 * Serialize a single chart's #NOTES section.
 */
function serializeChart(chart) {
  const { type, description, difficulty, meter, grooveRadar, notes } = chart;
  const numColumns = getColumnCount(type);
  const measureCount = getMeasureCountFromNotes(notes);

  const noteLines = [];

  for (let measure = 0; measure < measureCount; measure++) {
    // Find all notes in this measure
    const measureStart = measure * 4;
    const measureEnd = measureStart + 4;
    const measureNotes = notes.filter(n => n.beat >= measureStart && n.beat < measureEnd);

    // Determine the subdivision needed for this measure
    const subdivision = getRequiredSubdivision(measureNotes, measureStart);

    // Generate lines for this measure
    const lines = [];
    for (let row = 0; row < subdivision; row++) {
      const beat = measureStart + (row * 4) / subdivision;
      let line = '';
      for (let col = 0; col < numColumns; col++) {
        const note = measureNotes.find(
          n => Math.abs(n.beat - beat) < 0.001 && n.column === col
        );
        line += note ? (TYPE_TO_CHAR[note.type] || '0') : '0';
      }
      lines.push(line);
    }

    if (measure > 0) noteLines.push(',');
    noteLines.push(...lines);
  }

  return [
    `#NOTES:`,
    `     ${type}:`,
    `     ${description}:`,
    `     ${difficulty}:`,
    `     ${meter}:`,
    `     ${grooveRadar || '0,0,0,0,0'}:`,
    noteLines.join('\n'),
    ';',
  ].join('\n');
}

/**
 * Determine the minimum subdivision needed for a measure's notes.
 */
function getRequiredSubdivision(notes, measureStart) {
  if (notes.length === 0) return 4; // default quarter-note resolution

  let maxDiv = 4;
  for (const note of notes) {
    const offsetBeats = note.beat - measureStart;
    // Find the smallest denominator that places this note on a grid line
    for (const div of [4, 8, 12, 16, 24, 32, 48, 64, 192]) {
      const step = 4 / div;
      const remainder = offsetBeats % step;
      if (Math.abs(remainder) < 0.001 || Math.abs(remainder - step) < 0.001) {
        if (div > maxDiv) maxDiv = div;
        break;
      }
    }
  }

  return maxDiv;
}

function getMeasureCountFromNotes(notes) {
  if (notes.length === 0) return 1;
  const maxBeat = Math.max(...notes.map(n => n.beat));
  return Math.ceil(maxBeat / 4) + 1;
}

function getColumnCount(type) {
  const counts = {
    'pump-single': 5,
    'pump-double': 10,
    'pump-halfdouble': 6,
    'dance-single': 4,
    'dance-double': 8,
  };
  return counts[type] || 5;
}

function formatFloat(num) {
  return Number(num).toFixed(3);
}
