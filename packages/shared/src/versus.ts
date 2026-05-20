// Versus / multiplayer types shared by the Colyseus room and the browser client.
// Pure shapes — no Colyseus decorators here; the room broadcasts these as JSON.

import type { GameState, LockEvent } from './types.ts';

export type RoomPhase = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface AttackEntry {
  /** Total lines this entry will dump. */
  lines: number;
  /** One hole column per row, length === lines. */
  holeCols: number[];
  /** Server tick when this attack landed in the queue. Used for the cancel window. */
  arrivedAt: number;
}

export interface PlayerVersusState {
  /** Colyseus sessionId — clients match this against their own room.sessionId to identify themselves. */
  sessionId: string;
  handle: string;
  gameState: GameState;
  attackQueue: AttackEntry[];
  totalAttackSent: number;
  totalAttackReceived: number;
  /** Server tick at which this player topped out, or null while alive. */
  koAt: number | null;
  disconnected?: boolean;
  /** Set for exactly one tick after a lock — drives client SFX/FX. Null otherwise. */
  lastLockEvent?: LockEvent | null;
}

export interface RoomStateSnapshot {
  phase: RoomPhase;
  tick: number;
  /** Room seed — same value both players' boards were initialized from. */
  seed: number;
  /** [0] and [1] — opponent index is derived from your own sessionId on the client. */
  players: PlayerVersusState[];
  /** Set once phase flips to 'countdown'. Server tick at which 'playing' will begin. */
  startsAtTick?: number;
  /** Set once phase flips to 'finished'. */
  result?: MatchResult;
}

export type ClientInputType = 'move' | 'rotate' | 'softDrop' | 'hardDrop' | 'hold';

export interface ClientInput {
  type: ClientInputType;
  /** Required for 'move' and 'rotate'. */
  dir?: -1 | 1;
  /** Client's view of latest server tick — for diagnostics only. */
  tick: number;
}

export interface MatchResult {
  winnerHandle: string | null;
  reason: 'topout' | 'forfeit' | 'draw';
  players: Array<{
    handle: string;
    score: number;
    lines: number;
    attackSent: number;
    attackReceived: number;
  }>;
}

/** Server tick rate. Exported so the client can scale its render cadence comments. */
export const VERSUS_TICK_HZ = 30;
export const VERSUS_TICK_MS = 1000 / VERSUS_TICK_HZ;
/** Cancel window — incoming garbage waits this long before flushing onto the board. */
export const CANCEL_WINDOW_TICKS = 18; // ≈ 600 ms at 30 Hz
export const COUNTDOWN_TICKS = VERSUS_TICK_HZ * 3; // 3 s
export const RECONNECT_SECONDS = 30;
