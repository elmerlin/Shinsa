export const PIU_SESSION_MET = 11.8;
export const PIU_SONG_LENGTH_MINUTES = 2;
export const DEFAULT_WEIGHT_KG = 70;

function toPositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function buildSessionCalorieEstimate(songCount, weightKgInput) {
  const songs = Math.max(0, parseInt(songCount, 10) || 0);
  const parsedWeight = toPositiveNumber(weightKgInput);
  const personalized = parsedWeight !== null;
  const weightKgUsed = Math.round((personalized ? parsedWeight : DEFAULT_WEIGHT_KG) * 10) / 10;

  const kcalPerMinute = (PIU_SESSION_MET * 3.5 * weightKgUsed) / 200;
  const kcalPerHour = Math.max(0, Math.round(kcalPerMinute * 60));
  const kcalPerSong = kcalPerMinute * PIU_SONG_LENGTH_MINUTES;
  const estimatedKcal = Math.max(0, Math.round(songs * kcalPerSong));

  return {
    estimatedKcal,
    kcalPerHour,
    weightKgUsed,
    personalized,
  };
}
