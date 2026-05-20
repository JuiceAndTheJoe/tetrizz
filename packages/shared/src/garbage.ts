// Garbage / attack rules for 1v1 versus play.
//
// Attack model: every line clear converts to "lines sent" via ATTACK_TABLE,
// plus a combo bonus (consecutive clears) and a flat back-to-back bonus for
// Tetris-after-Tetris. Sent lines enter the opponent's queue with an
// `arrivedAt` tick; the room waits ~600ms (the cancel window) before flushing
// them onto the board, during which the opponent's own clears can subtract
// from the pending total.

import { applyClearScore, dropIntervalForLevel } from './scoring.ts';
import { collides } from './board.ts';
import { COLS, ROWS } from './board.ts';
import type { CellValue, GameState, Grid, LockEvent } from './types.ts';

/** Single line clears send 0 — keeps the early game from being a garbage exchange. */
export const ATTACK_TABLE: Readonly<Record<number, number>> = { 1: 0, 2: 1, 3: 2, 4: 4 };

/** Combo (consecutive-clear) bonus, indexed by GameState.combo AFTER the clear that triggered it. */
export const COMBO_BONUS: Readonly<Record<number, number>> = {
  0: 0, 1: 0, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4,
};

export const B2B_BONUS = 1;

/** Lines sent for one lock. `isB2B` = previous clear was a Tetris AND this one is too. */
export function computeAttack(ev: LockEvent, isB2B: boolean): number {
  const base = ATTACK_TABLE[ev.linesCleared] ?? 0;
  const comboKey = Math.max(0, ev.newCombo);
  const combo = COMBO_BONUS[comboKey] ?? COMBO_BONUS[10];
  const b2b = isB2B && ev.linesCleared === 4 ? B2B_BONUS : 0;
  return base + combo + b2b;
}

/**
 * Push `rows` garbage lines onto the BOTTOM of the grid, shifting existing
 * content up. Each row is a solid row of 'L' cells except the column at
 * holeCols[i], which is empty. If shifting pushes filled cells above row 0,
 * the returned state.status is 'dead' (top-out by garbage).
 *
 * Pure: returns a new state. `holeCols.length` must equal `rows`.
 */
export function applyGarbage(state: GameState, rows: number, holeCols: number[]): GameState {
  if (rows <= 0) return state;
  const grid = state.grid;
  const out: Grid = [];
  let topOut = false;

  // Shift the existing grid UP by `rows`. Anything that falls off the top
  // (and isn't empty) is a top-out.
  for (let r = 0; r < ROWS; r++) {
    const sourceRow = r + rows;
    if (sourceRow >= ROWS) {
      // We'll fill these slots with garbage rows below.
      continue;
    }
    out.push(grid[sourceRow].slice());
  }
  for (let r = 0; r < rows; r++) {
    if (r >= ROWS) break;
    // The rows that would have shifted off the top need to be checked.
    const lostRow = grid[r];
    if (lostRow.some((v) => v !== 0)) topOut = true;
  }

  // Append `rows` garbage rows at the bottom.
  for (let i = 0; i < rows; i++) {
    const hole = clampCol(holeCols[i] ?? 0);
    const row: CellValue[] = new Array(COLS).fill('L');
    row[hole] = 0;
    out.push(row);
  }

  while (out.length < ROWS) out.unshift(new Array<CellValue>(COLS).fill(0));
  while (out.length > ROWS) out.shift();

  const nextStatus = topOut || collides(out, state.current, 0, 0) ? 'dead' : state.status;

  return { ...state, grid: out, status: nextStatus };
}

function clampCol(c: number): number {
  if (!Number.isFinite(c)) return 0;
  const i = Math.floor(c);
  if (i < 0) return 0;
  if (i >= COLS) return COLS - 1;
  return i;
}

// Re-export for parity with other shared modules (so the server can import
// from a single barrel). Not consumed here — exists for ergonomic imports.
export { applyClearScore, dropIntervalForLevel };
