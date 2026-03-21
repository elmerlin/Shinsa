/**
 * Timing engine: convert between beat numbers and time (seconds),
 * handling BPM changes and stops.
 */

/**
 * Convert a beat number to time in seconds.
 * @param {number} beat - Beat number (0-based, quarter notes)
 * @param {Array<{beat: number, bpm: number}>} bpms - Sorted BPM change list
 * @param {Array<{beat: number, duration: number}>} stops - Sorted stops list
 * @returns {number} Time in seconds
 */
export function beatToTime(beat, bpms, stops = []) {
  if (!bpms || bpms.length === 0) return 0;

  let time = 0;
  let prevBeat = 0;
  let currentBPM = bpms[0].bpm;

  for (let i = 1; i < bpms.length; i++) {
    const changeBeat = bpms[i].beat;
    if (changeBeat >= beat) break;

    // Add time for the segment before this BPM change
    const segmentBeats = changeBeat - prevBeat;
    time += (segmentBeats / currentBPM) * 60;

    prevBeat = changeBeat;
    currentBPM = bpms[i].bpm;
  }

  // Add remaining beats at current BPM
  const remainingBeats = beat - prevBeat;
  time += (remainingBeats / currentBPM) * 60;

  // Add stop durations for stops that occur before this beat
  for (const stop of stops) {
    if (stop.beat < beat) {
      time += stop.duration;
    }
  }

  return time;
}

/**
 * Convert time in seconds to a beat number.
 * @param {number} time - Time in seconds
 * @param {Array<{beat: number, bpm: number}>} bpms - Sorted BPM change list
 * @param {Array<{beat: number, duration: number}>} stops - Sorted stops list
 * @returns {number} Beat number
 */
export function timeToBeat(time, bpms, stops = []) {
  if (!bpms || bpms.length === 0) return 0;

  // Subtract stop durations (accumulated before current time)
  let adjustedTime = time;
  let stopTimeAccum = 0;

  // We need to iterate and figure out where we are accounting for stops
  // Simple approach: binary search isn't clean with stops, so iterate segments
  let currentTime = 0;
  let currentBeat = 0;
  let bpmIdx = 0;
  let currentBPM = bpms[0].bpm;

  // Merge BPM changes and stops into a sorted event list
  const events = [];
  for (const b of bpms) events.push({ beat: b.beat, type: 'bpm', bpm: b.bpm });
  for (const s of stops) events.push({ beat: s.beat, type: 'stop', duration: s.duration });
  events.sort((a, b) => a.beat - b.beat || (a.type === 'bpm' ? -1 : 1));

  for (const event of events) {
    const segmentBeats = event.beat - currentBeat;
    const segmentTime = (segmentBeats / currentBPM) * 60;

    if (currentTime + segmentTime > time) {
      // Target time is within this segment
      const remainingTime = time - currentTime;
      return currentBeat + (remainingTime / 60) * currentBPM;
    }

    currentTime += segmentTime;
    currentBeat = event.beat;

    if (event.type === 'bpm') {
      currentBPM = event.bpm;
    } else if (event.type === 'stop') {
      if (currentTime + event.duration > time) {
        // We're inside a stop
        return currentBeat;
      }
      currentTime += event.duration;
    }
  }

  // Past all events, continue at last BPM
  const remainingTime = time - currentTime;
  return currentBeat + (remainingTime / 60) * currentBPM;
}

/**
 * Get the total duration in seconds for a chart.
 */
export function getTotalTime(totalBeats, bpms, stops = []) {
  return beatToTime(totalBeats, bpms, stops);
}

/**
 * Snap a beat value to the nearest grid position.
 * @param {number} beat - Raw beat value
 * @param {number} snapDivision - Snap resolution (e.g., 4 = quarter notes, 16 = 16th notes)
 * @returns {number} Snapped beat value
 */
export function snapBeat(beat, snapDivision) {
  const step = 4 / snapDivision; // beats per snap step
  return Math.round(beat / step) * step;
}
