/**
 * StepMania .ssc file parser.
 * Parses .ssc file text into structured JS object.
 * SSC differs from SM: timing data (BPMS, STOPS, etc.) can be per-chart
 * via #NOTEDATA blocks, and charts use explicit tags instead of colon-delimited fields.
 */

import { NOTE_TYPES } from './constants.js';

const NOTE_TYPE_MAP = {
  '1': 'tap',
  '2': 'hold_head',
  '3': 'hold_tail',
  '4': 'roll_head',
  'M': 'mine',
  'F': 'fake',
  'L': 'lift',
};

/**
 * Parse a .ssc file string into structured data.
 * @param {string} text - Raw .ssc file content
 * @returns {{ metadata: object, charts: Array }}
 */
export function parseSSC(text) {
  const content = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into global section and NOTEDATA blocks
  const notedataSplit = content.split(/^#NOTEDATA:;?\s*$/m);
  const globalSection = notedataSplit[0];
  const chartSections = notedataSplit.slice(1);

  // Parse global metadata
  const metadata = parseTagSection(globalSection);

  // Normalize global metadata
  if (metadata.bpms && typeof metadata.bpms === 'string') {
    metadata.bpms = parseBeatValuePairs(metadata.bpms).map(([beat, bpm]) => ({ beat, bpm }));
  }
  if (!metadata.bpms) metadata.bpms = [{ beat: 0, bpm: 120 }];

  if (metadata.stops && typeof metadata.stops === 'string') {
    metadata.stops = parseBeatValuePairs(metadata.stops).map(([beat, duration]) => ({ beat, duration }));
  }
  if (!metadata.stops) metadata.stops = [];

  if (metadata.offset !== undefined) metadata.offset = parseFloat(metadata.offset) || 0;
  if (metadata.samplestart !== undefined) metadata.samplestart = parseFloat(metadata.samplestart) || 0;
  if (metadata.samplelength !== undefined) metadata.samplelength = parseFloat(metadata.samplelength) || 0;

  // Parse each chart
  const charts = chartSections.map(section => parseChartSection(section, metadata));

  return { metadata, charts };
}

/**
 * Parse tag-value pairs from a section of SSC text.
 * Returns an object with lowercase tag keys.
 */
function parseTagSection(text) {
  const result = {};
  const tagRegex = /#([A-Z]+):([\s\S]*?);/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    result[match[1].toLowerCase()] = match[2].trim();
  }
  return result;
}

/**
 * Parse a single #NOTEDATA chart section.
 */
function parseChartSection(section, globalMetadata) {
  const tags = parseTagSection(section);

  const type = tags.stepstype || 'pump-single';
  const description = tags.description || '';
  const difficulty = tags.difficulty || 'Edit';
  const meter = parseInt(tags.meter) || 1;
  const grooveRadar = tags.radarvalues || '';

  // SSC allows per-chart timing; fall back to global
  let bpms = globalMetadata.bpms;
  if (tags.bpms) {
    bpms = parseBeatValuePairs(tags.bpms).map(([beat, bpm]) => ({ beat, bpm }));
  }

  let stops = globalMetadata.stops;
  if (tags.stops) {
    stops = parseBeatValuePairs(tags.stops).map(([beat, duration]) => ({ beat, duration }));
  }

  const noteData = tags.notes || '';
  const notes = parseNoteData(noteData, type);

  const chart = { type, description, difficulty, meter, grooveRadar, notes };

  // Attach per-chart timing if it differs from global
  if (tags.bpms) chart.bpms = bpms;
  if (tags.stops) chart.stops = stops;
  if (tags.offset !== undefined) chart.offset = parseFloat(tags.offset) || 0;

  return chart;
}

/**
 * Parse beat=value pairs like "0.000=120.000,48.000=150.000"
 */
function parseBeatValuePairs(text) {
  if (!text || !text.trim()) return [];
  return text
    .split(',')
    .map(pair => pair.trim())
    .filter(pair => pair.includes('='))
    .map(pair => {
      const [beat, val] = pair.split('=');
      return [parseFloat(beat), parseFloat(val)];
    })
    .filter(([b, v]) => !isNaN(b) && !isNaN(v));
}

/**
 * Parse note data string into an array of note events.
 */
function parseNoteData(noteData, gameType) {
  const notes = [];
  if (!noteData.trim()) return notes;

  const measures = noteData.split(',');

  for (let measureIdx = 0; measureIdx < measures.length; measureIdx++) {
    const measureText = measures[measureIdx].trim();
    const lines = measureText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length === 0) continue;

    const linesPerMeasure = lines.length;
    const beatsPerLine = 4 / linesPerMeasure;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const beat = measureIdx * 4 + lineIdx * beatsPerLine;

      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch === '0') continue;

        const noteType = NOTE_TYPE_MAP[ch];
        if (noteType) {
          notes.push({ beat, column: col, type: noteType });
        }
      }
    }
  }

  return notes;
}
