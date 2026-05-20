export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** A cell on the board: 0 = empty, or the letter of the piece that occupied it. */
export type CellValue = 0 | PieceType;

export type Grid = CellValue[][];

export type Rotation = 0 | 1 | 2 | 3;

export interface Piece {
  type: PieceType;
  rot: Rotation;
  x: number;
  y: number;
}

export interface BagState {
  /** Currently shuffled pieces waiting to be drawn (left-to-right). */
  pool: PieceType[];
  /** Seeded PRNG state. Plain number so it serializes cleanly for replays. */
  rngState: number;
}

export type GameStatus = 'playing' | 'dead';

export interface GameState {
  grid: Grid;
  current: Piece;
  /** Pieces queued after `current`. Fixed length once the game starts. */
  queue: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  /** -1 before any clear; increments on each consecutive clear; resets to -1 on a lock with 0 clears. */
  combo: number;
  dropIntervalMs: number;
  bag: BagState;
  status: GameStatus;
}

/** Emitted when a piece locks. Drives all client visual + audio FX. */
export interface LockEvent {
  linesCleared: number;
  intensity: number;
  scoreDelta: number;
  leveledUp: boolean;
  newLevel: number;
  newCombo: number;
  topOut: boolean;
}
