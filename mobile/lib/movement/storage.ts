import { prefs } from '@/lib/storage';
import type { MovementSession, PadCalibration } from './types';

const CALIBRATION_KEY = 'shinsa.movement.calibration';
const RECENT_SESSIONS_KEY = 'shinsa.movement.sessions';
const MAX_RECENT_SESSIONS = 8;

export async function savePadCalibration(calibration: PadCalibration): Promise<void> {
  await prefs.set(`${CALIBRATION_KEY}.${calibration.mode}`, JSON.stringify(calibration));
}

export async function loadPadCalibration(mode: PadCalibration['mode']): Promise<PadCalibration | null> {
  const raw = await prefs.get(`${CALIBRATION_KEY}.${mode}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PadCalibration;
  } catch {
    return null;
  }
}

export async function saveMovementSession(session: MovementSession): Promise<void> {
  const sessions = await loadRecentMovementSessions();
  const next = [session, ...sessions.filter((item) => item.id !== session.id)].slice(0, MAX_RECENT_SESSIONS);
  await prefs.set(RECENT_SESSIONS_KEY, JSON.stringify(next));
}

export async function loadRecentMovementSessions(): Promise<MovementSession[]> {
  const raw = await prefs.get(RECENT_SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as MovementSession[] : [];
  } catch {
    return [];
  }
}
