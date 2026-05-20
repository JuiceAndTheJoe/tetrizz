// Constants tuned in v0:
//   LINE_SCORE: classic Tetris values, multiplied by current level.
//   50 × combo × level: combo bonus (only kicks in from the 2nd consecutive clear since combo starts at 0 there).
//   5 lines per level, 0.78× drop interval per level — both updated from the original (10 / 0.85) to make level-up noticeable mid-session.
//   60ms floor so the highest levels remain playable.
export const LINE_SCORE: Readonly<Record<number, number>> = { 1: 100, 2: 300, 3: 500, 4: 800 };
export const LINES_PER_LEVEL = 5;
export const DROP_BASE_MS = 800;
export const DROP_RATIO = 0.78;
export const DROP_MIN_MS = 60;

export function levelFromLines(lines: number): number {
  return Math.floor(lines / LINES_PER_LEVEL) + 1;
}

export function dropIntervalForLevel(level: number): number {
  return Math.max(DROP_MIN_MS, DROP_BASE_MS * Math.pow(DROP_RATIO, level - 1));
}

export function fxTier(intensity: number): 0 | 1 | 2 | 3 {
  if (intensity >= 3) return 3;
  if (intensity >= 2) return 2;
  if (intensity >= 1) return 1;
  return 0;
}

export interface ScoreInputs {
  score: number;
  lines: number;
  level: number;
  combo: number;
  dropIntervalMs: number;
}

export interface ScoreContribution {
  scoreDelta: number;
  /** Drives client visual FX tiers — see fxTier(). */
  intensity: number;
  newCombo: number;
  newLines: number;
  newLevel: number;
  dropIntervalMs: number;
  leveledUp: boolean;
}

/** Returns the score/combo/level deltas for a single lock that cleared `linesCleared` lines. */
export function applyClearScore(prev: ScoreInputs, linesCleared: number): ScoreContribution {
  const newCombo = prev.combo + 1;
  const baseScore = (LINE_SCORE[linesCleared] ?? 0) * prev.level;
  const comboBonus = newCombo > 0 ? 50 * newCombo * prev.level : 0;
  const scoreDelta = baseScore + comboBonus;
  const newLines = prev.lines + linesCleared;
  const newLevel = levelFromLines(newLines);
  const leveledUp = newLevel !== prev.level;
  const dropIntervalMs = leveledUp ? dropIntervalForLevel(newLevel) : prev.dropIntervalMs;
  const intensity = Math.max(0, linesCleared - 1) + Math.max(0, newCombo);
  return { scoreDelta, intensity, newCombo, newLines, newLevel, dropIntervalMs, leveledUp };
}
