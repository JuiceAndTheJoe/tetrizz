import { createBag, takeNext } from './bag.ts';
import { clearLines, collides, COLS, emptyGrid, ghostY, mergePiece, tryMove, tryRotate } from './board.ts';
import { SHAPES } from './pieces.ts';
import { applyClearScore, dropIntervalForLevel } from './scoring.ts';
import type { GameState, LockEvent, Piece, PieceType } from './types.ts';

export const QUEUE_SIZE = 3;

export function spawnPiece(type: PieceType): Piece {
  return {
    type,
    rot: 0,
    x: Math.floor((COLS - SHAPES[type][0][0].length) / 2),
    // I-piece bounding box is 4 tall; spawning at y=-1 keeps the visible row on row 0.
    y: type === 'I' ? -1 : 0,
  };
}

export function createGame(seed: number): GameState {
  let bag = createBag(seed);
  const draws: PieceType[] = [];
  for (let i = 0; i < QUEUE_SIZE + 1; i++) {
    const r = takeNext(bag);
    draws.push(r.type);
    bag = r.bag;
  }
  const currentType = draws[0];
  const queue = draws.slice(1);
  return {
    grid: emptyGrid(),
    current: spawnPiece(currentType),
    queue,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    dropIntervalMs: dropIntervalForLevel(1),
    bag,
    status: 'playing',
  };
}

export interface StepResult {
  state: GameState;
  /** Present iff this step locked the current piece. */
  lockEvent?: LockEvent;
}

export function inputMove(state: GameState, dx: -1 | 1): GameState {
  if (state.status !== 'playing') return state;
  const moved = tryMove(state.grid, state.current, dx);
  return moved ? { ...state, current: moved } : state;
}

export function inputRotate(state: GameState, dir: 1 | -1): GameState {
  if (state.status !== 'playing') return state;
  const rotated = tryRotate(state.grid, state.current, dir);
  return rotated ? { ...state, current: rotated } : state;
}

/** Soft drop: +1 cell if possible (+1 score), otherwise lock. */
export function inputSoftDrop(state: GameState): StepResult {
  if (state.status !== 'playing') return { state };
  if (!collides(state.grid, state.current, 0, 1)) {
    return {
      state: {
        ...state,
        current: { ...state.current, y: state.current.y + 1 },
        score: state.score + 1,
      },
    };
  }
  return lockCurrent(state);
}

export function inputHardDrop(state: GameState): StepResult {
  if (state.status !== 'playing') return { state };
  const targetY = ghostY(state.grid, state.current);
  const dropDistance = targetY - state.current.y;
  const slammed: GameState = {
    ...state,
    current: { ...state.current, y: targetY },
    score: state.score + dropDistance * 2,
  };
  return lockCurrent(slammed);
}

/** Gravity tick — call when dropIntervalMs has elapsed. */
export function tickGravity(state: GameState): StepResult {
  if (state.status !== 'playing') return { state };
  if (!collides(state.grid, state.current, 0, 1)) {
    return { state: { ...state, current: { ...state.current, y: state.current.y + 1 } } };
  }
  return lockCurrent(state);
}

export function inputHold(state: GameState): GameState {
  if (state.status !== 'playing' || !state.canHold) return state;
  if (state.hold == null) {
    const [nextType, ...rest] = state.queue;
    const draw = takeNext(state.bag);
    return {
      ...state,
      hold: state.current.type,
      current: spawnPiece(nextType),
      queue: [...rest, draw.type],
      bag: draw.bag,
      canHold: false,
    };
  }
  return {
    ...state,
    hold: state.current.type,
    current: spawnPiece(state.hold),
    canHold: false,
  };
}

function lockCurrent(state: GameState): StepResult {
  const merged = mergePiece(state.grid, state.current);

  if (merged.topOut) {
    return {
      state: { ...state, grid: merged.grid, status: 'dead' },
      lockEvent: {
        linesCleared: 0,
        intensity: 0,
        scoreDelta: 0,
        leveledUp: false,
        newLevel: state.level,
        newCombo: state.combo,
        topOut: true,
      },
    };
  }

  const cleared = clearLines(merged.grid);

  let scoreDelta = 0;
  let intensity = 0;
  let newCombo = -1;
  let newLines = state.lines;
  let newLevel = state.level;
  let dropIntervalMs = state.dropIntervalMs;
  let leveledUp = false;

  if (cleared.cleared > 0) {
    const contribution = applyClearScore(state, cleared.cleared);
    scoreDelta = contribution.scoreDelta;
    intensity = contribution.intensity;
    newCombo = contribution.newCombo;
    newLines = contribution.newLines;
    newLevel = contribution.newLevel;
    dropIntervalMs = contribution.dropIntervalMs;
    leveledUp = contribution.leveledUp;
  }

  // Advance the queue: draw a new piece into the slot the front piece just left.
  const [nextType, ...restQueue] = state.queue;
  const draw = takeNext(state.bag);
  const nextCurrent = spawnPiece(nextType);
  const spawnDead = collides(cleared.grid, nextCurrent, 0, 0);

  const nextState: GameState = {
    ...state,
    grid: cleared.grid,
    current: nextCurrent,
    queue: [...restQueue, draw.type],
    bag: draw.bag,
    canHold: true,
    score: state.score + scoreDelta,
    combo: newCombo,
    lines: newLines,
    level: newLevel,
    dropIntervalMs,
    status: spawnDead ? 'dead' : 'playing',
  };

  return {
    state: nextState,
    lockEvent: {
      linesCleared: cleared.cleared,
      intensity,
      scoreDelta,
      leveledUp,
      newLevel,
      newCombo,
      topOut: spawnDead,
    },
  };
}
