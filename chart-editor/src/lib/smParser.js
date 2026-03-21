/**
 * StepMania .sm file parser.
 * Parses .sm file text into a structured JS object.
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
 * Parse a .sm file string into structured data.
 * @param {string} text - Raw .sm file content
 * @returns {{ metadata: object, charts: Array }}
 */
export function parseSM(text) {
  const metadata = {};
  const charts = [];

  // Normalize line endings
  const content = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract all #TAG:VALUE; pairs
  // We need to handle #NOTES specially since it contains colons
  const tagRegex = /#([A-Z]+):([\s\S]*?);/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1];
    const value = match[2].trim();

    if (tag === 'NOTES') {
      charts.push(parseNotesSection(value));
    } else {
      metadata[tag.toLowerCase()] = parseMetadataValue(tag, value);
    }
  }

  // Ensure bpms and stops exist
  if (!metadata.bpms) metadata.bpms = [{ beat: 0, bpm: 120 }];
  if (!metadata.stops) metadata.stops = [];

  return { metadata, charts };
}

/**
 * Parse a metadata value based on tag type.
 */
function parseMetadataValue(tag, value) {
  switch (tag) {
    case 'OFFSET':
      return parseFloat(value) || 0;

    case 'BPMS':
      return parseBeatValuePairs(value).map(([beat, bpm]) => ({ beat, bpm }));

    case 'STOPS':
      if (!value) return [];
      return parseBeatValuePairs(value).map(([beat, duration]) => ({ beat, duration }));

    case 'SAMPLESTART':
    case 'SAMPLELENGTH':
      return parseFloat(value) || 0;

    default:
      return value;
  }
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
 * Parse a #NOTES section value.
 * Format: game-type : description : difficulty : meter : groove-radar : note-data
 */
function parseNotesSection(value) {
  const parts = value.split(':');
  if (parts.length < 6) {
    return {
      type: 'pump-single',
      description: '',
      difficulty: 'Edit',
      meter: 1,
      grooveRadar: '',
      notes: [],
    };
  }

  const type = parts[0].trim();
  const description = parts[1].trim();
  const difficulty = parts[2].trim();
  const meter = parseInt(parts[3].trim()) || 1;
  const grooveRadar = parts[4].trim();
  const noteData = parts.slice(5).join(':').trim();

  const notes = parseNoteData(noteData, type);

  return { type, description, difficulty, meter, grooveRadar, notes };
}

/**
 * Parse note data string into an array of note events.
 * Measures are separated by commas. Each measure has N lines,
 * where N determines the subdivision (N lines = each line is 4/N beats).
 */
function parseNoteData(noteData, gameType) {
  const notes = [];
  const measures = noteData.split(',');

  for (let measureIdx = 0; measureIdx < measures.length; measureIdx++) {
    const measureText = measures[measureIdx].trim();
    const lines = measureText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length === 0) continue;

    const linesPerMeasure = lines.length;
    const beatsPerLine = 4 / linesPerMeasure; // 4 beats per measure

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const beat = measureIdx * 4 + lineIdx * beatsPerLine;

      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch === '0') continue; // empty

        const noteType = NOTE_TYPE_MAP[ch];
        if (noteType) {
          notes.push({ beat, column: col, type: noteType });
        }
      }
    }
  }

  return notes;
}

/**
 * Get total number of measures in a chart.
 */
export function getMeasureCount(notes) {
  if (notes.length === 0) return 0;
  const maxBeat = Math.max(...notes.map(n => n.beat));
  return Math.ceil(maxBeat / 4) + 1;
}

/**
 * Get total beats in a chart.
 */
export function getTotalBeats(notes) {
  if (notes.length === 0) return 0;
  return Math.max(...notes.map(n => n.beat)) + 4; // add one measure of padding
}
