import { SHAPES } from './pieces.ts';
import type { CellValue, Grid, Piece, Rotation } from './types.ts';

export const COLS = 10;
export const ROWS = 20;

export function emptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array<CellValue>(COLS).fill(0));
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

function normalizeRot(rot: number): Rotation {
  return (((rot % 4) + 4) % 4) as Rotation;
}

export function collides(grid: Grid, p: Piece, dx = 0, dy = 0, dr = 0): boolean {
  const rot = normalizeRot(p.rot + dr);
  const s = SHAPES[p.type][rot];
  for (let r = 0; r < s.length; r++) {
    for (let c = 0; c < s[r].length; c++) {
      if (!s[r][c]) continue;
      const nx = p.x + c + dx;
      const ny = p.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && grid[ny][nx] !== 0) return true;
    }
  }
  return false;
}

export const KICKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0],
];

/** Returns the kicked piece on success, null if no kick fits. */
export function tryRotate(grid: Grid, p: Piece, dir: 1 | -1): Piece | null {
  for (const [dx, dy] of KICKS) {
    if (!collides(grid, p, dx, dy, dir)) {
      return { ...p, rot: normalizeRot(p.rot + dir), x: p.x + dx, y: p.y + dy };
    }
  }
  return null;
}

export function tryMove(grid: Grid, p: Piece, dx: number): Piece | null {
  if (collides(grid, p, dx, 0)) return null;
  return { ...p, x: p.x + dx };
}

/** y position the piece would lock at if it dropped straight down right now. */
export function ghostY(grid: Grid, p: Piece): number {
  let y = p.y;
  while (!collides(grid, { ...p, y }, 0, 1)) y++;
  return y;
}

export interface MergeResult {
  grid: Grid;
  /** True if any filled cell would have landed above row 0 — caller treats this as game over. */
  topOut: boolean;
}

/** Stamps `p` into a freshly cloned grid. */
export function mergePiece(grid: Grid, p: Piece): MergeResult {
  const out = cloneGrid(grid);
  const s = SHAPES[p.type][p.rot];
  let topOut = false;
  for (let r = 0; r < s.length; r++) {
    for (let c = 0; c < s[r].length; c++) {
      if (!s[r][c]) continue;
      const ny = p.y + r;
      const nx = p.x + c;
      if (ny < 0) { topOut = true; continue; }
      out[ny][nx] = p.type;
    }
  }
  return { grid: out, topOut };
}

export interface ClearLinesResult {
  grid: Grid;
  cleared: number;
}

export function clearLines(grid: Grid): ClearLinesResult {
  const kept: Grid = [];
  let cleared = 0;
  for (let r = 0; r < ROWS; r++) {
    if (grid[r].every((v) => v !== 0)) {
      cleared++;
    } else {
      kept.push(grid[r].slice());
    }
  }
  while (kept.length < ROWS) {
    kept.unshift(Array<CellValue>(COLS).fill(0));
  }
  return { grid: kept, cleared };
}
