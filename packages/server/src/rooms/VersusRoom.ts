import { Room, Client } from 'colyseus';
import type pg from 'pg';
import {
  applyGarbage,
  computeAttack,
  createGame,
  inputHardDrop,
  inputHold,
  inputMove,
  inputRotate,
  inputSoftDrop,
  tickGravity,
  nextInt,
  CANCEL_WINDOW_TICKS,
  COUNTDOWN_TICKS,
  RECONNECT_SECONDS,
  VERSUS_TICK_MS,
  COLS,
  type ClientInput,
  type ClientInputType,
  type AttackEntry,
  type GameState,
  type LockEvent,
  type MatchResult,
  type PlayerVersusState,
  type RoomStateSnapshot,
} from '@tetrizz/shared';

interface RoomCreateOptions {
  pool: pg.Pool | null;
}

interface JoinOptions {
  handle?: string;
}

interface PlayerSlot {
  sessionId: string | null;
  state: PlayerVersusState;
  inputQueue: ClientInput[];
  gravityAccumulatorMs: number;
  /** Last completed line clear was a Tetris — drives B2B bonus. */
  lastClearWasTetris: boolean;
  /** Pending one-shot lock event to broadcast for one tick. */
  pendingLockEvent: LockEvent | null;
}

const MAX_HANDLE_LEN = 14;
const HANDLE_RE = /^[a-zA-Z0-9._-]+$/;

export class VersusRoom extends Room {
  override maxClients = 2;

  private pool: pg.Pool | null = null;
  private seed = 0;
  private phase: RoomStateSnapshot['phase'] = 'waiting';
  private tickCounter = 0;
  private startsAtTick: number | undefined;
  private players: PlayerSlot[] = [];
  private tickHandle: NodeJS.Timeout | null = null;
  private countdownHandle: NodeJS.Timeout | null = null;
  private garbageRngState = 0;
  private dbMatchId: number | null = null;
  private result: MatchResult | undefined;
  /** Sessions that have asked to rematch in the current 'finished' window. */
  private rematchReady: Set<string> = new Set();
  /** Disconnect timer set when entering 'finished'. Cleared on a successful rematch. */
  private rematchTimer: NodeJS.Timeout | null = null;

  override onCreate(options: RoomCreateOptions): void {
    this.pool = options.pool ?? null;
    this.seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    this.garbageRngState = (this.seed * 0x9e3779b1) | 0;

    this.onMessage('input', (client, msg: ClientInput) => this.handleInput(client, msg));
    this.onMessage('pong', () => {/* client liveness ack */});
    this.onMessage('rematch', (client) => this.handleRematch(client));
  }

  override onJoin(client: Client, options: JoinOptions): void {
    const handle = sanitizeHandle(options.handle) ?? `@anon${Math.floor(Math.random() * 1000)}`;
    const slot: PlayerSlot = {
      sessionId: client.sessionId,
      state: emptyPlayerState(handle, client.sessionId),
      inputQueue: [],
      gravityAccumulatorMs: 0,
      lastClearWasTetris: false,
      pendingLockEvent: null,
    };
    this.players.push(slot);
    console.log(`[versus] join session=${client.sessionId} handle=${handle} players=${this.players.length}/2`);
    this.broadcastSnapshot();
    if (this.players.length === 2 && this.phase === 'waiting') {
      this.startCountdown();
    }
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const slot = this.findSlot(client.sessionId);
    if (!slot) return;
    console.log(
      `[versus] leave session=${client.sessionId} handle=${slot.state.handle} ` +
      `phase=${this.phase} consented=${consented}`,
    );

    if (this.phase === 'waiting') {
      // Pre-match: just drop the player; room stays open for the next joiner.
      this.players = this.players.filter((p) => p !== slot);
      this.broadcastSnapshot();
      return;
    }

    if (this.phase === 'finished' && consented) {
      // Post-match leave (back-to-menu / cancel-during-rematch). Rematch is off the
      // table once anyone walks; tell the other client and tear down the room shortly.
      this.rematchReady.delete(client.sessionId);
      this.players = this.players.filter((p) => p !== slot);
      this.broadcast('rematchAborted', { reason: 'oppLeft' });
      this.broadcastSnapshot();
      if (this.rematchTimer) clearTimeout(this.rematchTimer);
      this.rematchTimer = setTimeout(() => this.disconnect(), 1500);
      return;
    }

    if (consented) {
      this.forfeit(slot);
      return;
    }

    slot.state.disconnected = true;
    this.broadcastSnapshot();
    try {
      const reconnected = await this.allowReconnection(client, RECONNECT_SECONDS);
      console.log(`[versus] reconnect handle=${slot.state.handle} session=${reconnected.sessionId}`);
      slot.sessionId = reconnected.sessionId;
      slot.state.sessionId = reconnected.sessionId;
      slot.state.disconnected = false;
      this.broadcastSnapshot();
    } catch {
      console.log(`[versus] forfeit-on-timeout handle=${slot.state.handle}`);
      this.forfeit(slot);
    }
  }

  override onDispose(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    if (this.countdownHandle) clearTimeout(this.countdownHandle);
    if (this.rematchTimer) clearTimeout(this.rematchTimer);
  }

  // ---------- input ----------

  private handleInput(client: Client, msg: ClientInput): void {
    if (this.phase !== 'playing') return;
    const slot = this.findSlot(client.sessionId);
    if (!slot) return;
    if (slot.state.gameState.status !== 'playing') return;
    if (!isValidInputType(msg?.type)) return;
    slot.inputQueue.push({ type: msg.type, dir: msg.dir, tick: msg.tick ?? this.tickCounter });
  }

  // ---------- lifecycle ----------

  private startCountdown(): void {
    // Sticky-lock the room for the rest of its life the instant a match begins.
    // Colyseus auto-locks at maxClients but AUTO-UNLOCKS the moment a client
    // leaves — so when a player clicks "back to menu" after the match and
    // re-queues, matchmaking would route them straight back into this finished,
    // about-to-`disconnect()` room (→ "connection lost" on the rematch). An
    // explicit lock() (no args) sets _lockedExplicitly, which is never
    // auto-unlocked on leave, keeping this room out of matchmaking permanently.
    // Reconnection tokens bypass the lock, so allowReconnection still works.
    void this.lock();
    this.phase = 'countdown';
    this.startsAtTick = this.tickCounter + COUNTDOWN_TICKS;
    for (const p of this.players) {
      p.state.gameState = createGame(this.seed);
    }
    this.broadcastSnapshot();
    this.countdownHandle = setTimeout(() => this.startMatch(), COUNTDOWN_TICKS * VERSUS_TICK_MS);
  }

  private async startMatch(): Promise<void> {
    this.phase = 'playing';
    this.tickCounter = 0;
    this.startsAtTick = undefined;
    for (const p of this.players) {
      p.gravityAccumulatorMs = 0;
      p.state.gameState = createGame(this.seed);
      p.state.attackQueue = [];
      p.state.totalAttackSent = 0;
      p.state.totalAttackReceived = 0;
      p.state.koAt = null;
      p.state.lastLockEvent = null;
      p.lastClearWasTetris = false;
    }
    this.dbMatchId = await this.insertMatchRow();
    this.tickHandle = setInterval(() => this.tick(), VERSUS_TICK_MS);
    this.broadcastSnapshot();
  }

  private tick(): void {
    if (this.phase !== 'playing') return;
    this.tickCounter++;

    // 1. Drain inputs and accumulate gravity per player.
    for (const slot of this.players) {
      if (slot.state.gameState.status !== 'playing') continue;
      this.drainInputs(slot);
      this.advanceGravity(slot);
    }

    // 2. Flush ripe garbage onto each player's board (after any clears resolved above).
    for (const slot of this.players) {
      if (slot.state.gameState.status !== 'playing') continue;
      this.flushGarbage(slot);
    }

    // 3. KO check.
    for (const slot of this.players) {
      if (slot.state.gameState.status === 'dead' && slot.state.koAt == null) {
        slot.state.koAt = this.tickCounter;
      }
    }
    const alive = this.players.filter((p) => p.state.koAt == null);
    if (alive.length <= 1 && this.players.length === 2) {
      this.endMatch();
    }

    // 4. Send ping every 25s for OSC reverse-proxy keepalive (Colyseus also pings).
    if (this.tickCounter % 750 === 0) {
      this.broadcast('ping', { t: Date.now() });
    }

    // 5. Broadcast snapshot, then clear one-shot lastLockEvent flags.
    this.broadcastSnapshot();
    for (const slot of this.players) slot.state.lastLockEvent = null;
  }

  // ---------- per-tick helpers ----------

  private drainInputs(slot: PlayerSlot): void {
    if (slot.inputQueue.length === 0) return;
    const queue = slot.inputQueue;
    slot.inputQueue = [];
    for (const msg of queue) {
      if (slot.state.gameState.status !== 'playing') break;
      this.applyOneInput(slot, msg);
    }
  }

  private applyOneInput(slot: PlayerSlot, msg: ClientInput): void {
    const before = slot.state.gameState;
    let after = before;
    let lock: LockEvent | undefined;

    switch (msg.type) {
      case 'move':
        if (msg.dir === -1 || msg.dir === 1) after = inputMove(before, msg.dir);
        break;
      case 'rotate':
        if (msg.dir === -1 || msg.dir === 1) after = inputRotate(before, msg.dir);
        break;
      case 'softDrop': {
        const r = inputSoftDrop(before);
        after = r.state;
        lock = r.lockEvent;
        break;
      }
      case 'hardDrop': {
        const r = inputHardDrop(before);
        after = r.state;
        lock = r.lockEvent;
        break;
      }
      case 'hold':
        after = inputHold(before);
        break;
    }
    slot.state.gameState = after;
    if (lock) this.onLock(slot, lock);
  }

  private advanceGravity(slot: PlayerSlot): void {
    slot.gravityAccumulatorMs += VERSUS_TICK_MS;
    while (
      slot.state.gameState.status === 'playing' &&
      slot.gravityAccumulatorMs >= slot.state.gameState.dropIntervalMs
    ) {
      slot.gravityAccumulatorMs -= slot.state.gameState.dropIntervalMs;
      const r = tickGravity(slot.state.gameState);
      slot.state.gameState = r.state;
      if (r.lockEvent) this.onLock(slot, r.lockEvent);
    }
  }

  private onLock(slot: PlayerSlot, ev: LockEvent): void {
    slot.pendingLockEvent = ev;
    slot.state.lastLockEvent = ev;

    if (ev.linesCleared > 0) {
      const isB2B = slot.lastClearWasTetris && ev.linesCleared === 4;
      const outgoing = computeAttack(ev, isB2B);
      slot.lastClearWasTetris = ev.linesCleared === 4;

      // First, the player's clears cancel pending incoming garbage.
      let remaining = outgoing;
      remaining = this.cancelIncoming(slot, remaining);
      // Surplus goes to the opponent.
      if (remaining > 0) {
        const opp = this.opponentOf(slot);
        if (opp && opp.state.gameState.status === 'playing') {
          const holes = this.rollHoles(remaining);
          opp.state.attackQueue.push({
            lines: remaining,
            holeCols: holes,
            arrivedAt: this.tickCounter,
          });
          slot.state.totalAttackSent += remaining;
        }
      }
    } else {
      slot.lastClearWasTetris = false;
    }
  }

  /** Subtracts incoming-attack lines from the EARLIEST pending entry. Returns leftover the player can still send. */
  private cancelIncoming(slot: PlayerSlot, lines: number): number {
    let remaining = lines;
    while (remaining > 0 && slot.state.attackQueue.length > 0) {
      const head = slot.state.attackQueue[0];
      if (head.lines > remaining) {
        head.lines -= remaining;
        head.holeCols = head.holeCols.slice(remaining);
        remaining = 0;
      } else {
        remaining -= head.lines;
        slot.state.attackQueue.shift();
      }
    }
    return remaining;
  }

  private flushGarbage(slot: PlayerSlot): void {
    if (slot.state.attackQueue.length === 0) return;
    const ripe: AttackEntry[] = [];
    const kept: AttackEntry[] = [];
    for (const entry of slot.state.attackQueue) {
      if (entry.arrivedAt <= this.tickCounter - CANCEL_WINDOW_TICKS) ripe.push(entry);
      else kept.push(entry);
    }
    if (ripe.length === 0) return;
    slot.state.attackQueue = kept;

    let next: GameState = slot.state.gameState;
    let totalRows = 0;
    for (const entry of ripe) {
      next = applyGarbage(next, entry.lines, entry.holeCols);
      totalRows += entry.lines;
      if (next.status === 'dead') break;
    }
    slot.state.gameState = next;
    slot.state.totalAttackReceived += totalRows;
  }

  private rollHoles(rows: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < rows; i++) {
      const [pick, next] = nextInt(this.garbageRngState, COLS);
      this.garbageRngState = next;
      out.push(pick);
    }
    return out;
  }

  private opponentOf(slot: PlayerSlot): PlayerSlot | undefined {
    return this.players.find((p) => p !== slot);
  }

  private findSlot(sessionId: string): PlayerSlot | undefined {
    return this.players.find((p) => p.sessionId === sessionId);
  }

  // ---------- match end ----------

  private forfeit(loser: PlayerSlot): void {
    const winner = this.opponentOf(loser);
    if (loser.state.koAt == null) loser.state.koAt = this.tickCounter;
    this.result = {
      winnerHandle: winner ? winner.state.handle : null,
      reason: 'forfeit',
      players: this.players.map(toResultPlayer),
    };
    this.finalize();
  }

  private endMatch(): void {
    const alive = this.players.filter((p) => p.state.koAt == null);
    let winner: PlayerSlot | undefined;
    let reason: MatchResult['reason'] = 'topout';
    if (alive.length === 1) {
      winner = alive[0];
    } else {
      reason = 'draw';
    }
    this.result = {
      winnerHandle: winner ? winner.state.handle : null,
      reason,
      players: this.players.map(toResultPlayer),
    };
    this.finalize();
  }

  private finalize(): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.rematchReady.clear();
    void this.writeMatchResults();
    this.broadcastSnapshot();
    // Give both clients a window to opt into a rematch before tearing the room down.
    if (this.rematchTimer) clearTimeout(this.rematchTimer);
    this.rematchTimer = setTimeout(() => this.disconnect(), 30_000);
  }

  // ---------- rematch ----------

  private handleRematch(client: Client): void {
    if (this.phase !== 'finished') return;
    const slot = this.findSlot(client.sessionId);
    if (!slot) return;
    this.rematchReady.add(client.sessionId);
    this.broadcast('rematchStatus', {
      ready: [...this.rematchReady],
      needed: this.players.length,
    });
    if (this.players.length >= 2 && this.players.every((p) => p.sessionId && this.rematchReady.has(p.sessionId))) {
      this.restartMatch();
    }
  }

  private restartMatch(): void {
    if (this.rematchTimer) {
      clearTimeout(this.rematchTimer);
      this.rematchTimer = null;
    }
    if (this.countdownHandle) {
      clearTimeout(this.countdownHandle);
      this.countdownHandle = null;
    }
    this.rematchReady.clear();
    this.result = undefined;
    this.tickCounter = 0;
    this.startsAtTick = undefined;
    this.dbMatchId = null;
    // Fresh seed so the piece sequence isn't a replay of the last match.
    this.seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    this.garbageRngState = (this.seed * 0x9e3779b1) | 0;
    for (const p of this.players) {
      p.state.gameState = createGame(this.seed);
      p.state.attackQueue = [];
      p.state.totalAttackSent = 0;
      p.state.totalAttackReceived = 0;
      p.state.koAt = null;
      p.state.lastLockEvent = null;
      p.state.disconnected = false;
      p.inputQueue = [];
      p.gravityAccumulatorMs = 0;
      p.lastClearWasTetris = false;
      p.pendingLockEvent = null;
    }
    this.phase = 'waiting';
    this.startCountdown();
  }

  private async insertMatchRow(): Promise<number | null> {
    if (!this.pool) return null;
    try {
      const res = await this.pool.query<{ id: string }>(
        `INSERT INTO matches (seed, status) VALUES ($1, 'in_progress') RETURNING id`,
        [this.seed],
      );
      return Number(res.rows[0]?.id ?? 0) || null;
    } catch (err) {
      console.error('[versus] insert match failed', err);
      return null;
    }
  }

  private async writeMatchResults(): Promise<void> {
    if (!this.pool || this.dbMatchId == null || !this.result) return;
    const status = this.result.reason;
    try {
      await this.pool.query(
        `UPDATE matches SET ended_at = now(), status = $2, winner_handle = $3 WHERE id = $1`,
        [this.dbMatchId, status, this.result.winnerHandle],
      );
      for (const slot of this.players) {
        await this.pool.query(
          `INSERT INTO match_players (match_id, handle, score, lines, attack_sent, attack_received, ko_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (match_id, handle) DO NOTHING`,
          [
            this.dbMatchId,
            slot.state.handle,
            slot.state.gameState.score,
            slot.state.gameState.lines,
            slot.state.totalAttackSent,
            slot.state.totalAttackReceived,
            slot.state.koAt,
          ],
        );
      }
    } catch (err) {
      console.error('[versus] match result write failed', err);
    }
  }

  // ---------- broadcast ----------

  private broadcastSnapshot(): void {
    const snapshot: RoomStateSnapshot = {
      phase: this.phase,
      tick: this.tickCounter,
      seed: this.seed,
      players: this.players.map((p) => p.state),
      startsAtTick: this.startsAtTick,
      result: this.result,
    };
    this.broadcast('snapshot', snapshot);
  }
}

function emptyPlayerState(handle: string, sessionId: string): PlayerVersusState {
  return {
    sessionId,
    handle,
    gameState: createGame(0),
    attackQueue: [],
    totalAttackSent: 0,
    totalAttackReceived: 0,
    koAt: null,
    disconnected: false,
    lastLockEvent: null,
  };
}

function toResultPlayer(p: PlayerSlot): MatchResult['players'][number] {
  return {
    handle: p.state.handle,
    score: p.state.gameState.score,
    lines: p.state.gameState.lines,
    attackSent: p.state.totalAttackSent,
    attackReceived: p.state.totalAttackReceived,
  };
}

function sanitizeHandle(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^@+/, '').slice(0, MAX_HANDLE_LEN);
  if (!trimmed) return null;
  if (!HANDLE_RE.test(trimmed)) return null;
  return '@' + trimmed;
}

function isValidInputType(t: unknown): t is ClientInputType {
  return t === 'move' || t === 'rotate' || t === 'softDrop' || t === 'hardDrop' || t === 'hold';
}
