import Phaser from 'phaser';
import {
  COLS, ROWS, SHAPES, cellColor, fxTier,
  CANCEL_WINDOW_TICKS, COUNTDOWN_TICKS, RECONNECT_SECONDS, VERSUS_TICK_HZ,
  type ClientInput, type PlayerVersusState, type RoomStateSnapshot,
  type PieceType, type CellValue,
} from '@tetrizz/shared';
import { RoomClient } from '../net/room.ts';
import { bindInput, type InputBindings } from '../input.ts';
import { showOverlay, hideOverlay } from '../ui/overlay.ts';
import { setStatus } from '../ui/hud.ts';
import { Sfx } from '../audio/sfx.ts';
import { loadMuted } from '../persistence/store.ts';
import { mountTouchControls } from '../ui/touch.ts';
import { setBgTier } from '../fx/bgglow.ts';
import { CameraShake } from '../fx/shake.ts';
import { EmberEmitter } from '../fx/embers.ts';
import { FlameEmitter } from '../fx/flames.ts';
import { ensureTextures } from '../fx/textures.ts';
import { CLEAR_PHRASES, STREAK_LOSS_MSGS, pickRandom } from '../ui/phrases.ts';
import { flash, type ReactionKind, type ReactionSize } from '../ui/reactions.ts';
import { showMogTakeover, hideMogTakeover } from '../ui/mogTakeover.ts';
import { setActiveSfx, syncAudioUI } from '../ui/audioControls.ts';

interface VersusData {
  roomClient: RoomClient;
  mySessionId: string;
  initialSnapshot: RoomStateSnapshot;
}

const MY_CELL = 28;
const OPP_CELL = 14;
const FRAME_PAD = 8;
const GUTTER = 56;
// Left rail holding the Hold + Next mini boards.
const SIDE_W = 64;
const SIDE_GUTTER = 26;
const MINI_CELL = 13;
const SIDE_BOX_H = 58;
const SIDE_LABEL_H = 14;

const MY_W = COLS * MY_CELL;       // 280
const MY_H = ROWS * MY_CELL;       // 560
const OPP_W = COLS * OPP_CELL;     // 140
const OPP_H = ROWS * OPP_CELL;     // 280

const SIDE_X = FRAME_PAD;
const MY_X = SIDE_X + SIDE_W + SIDE_GUTTER;     // 98
const MY_Y = FRAME_PAD;
const OPP_X = MY_X + MY_W + GUTTER;             // 434
const OPP_Y = MY_Y + Math.floor((MY_H - OPP_H) / 2);
const CANVAS_W = OPP_X + OPP_W + FRAME_PAD;     // 582  (keep style.css aspect-ratio in sync)
const CANVAS_H = MY_H + FRAME_PAD * 2;          // 576

// Hold/Next box positions inside the left rail.
const HOLD_LABEL_Y = MY_Y;
const HOLD_BOX_Y = HOLD_LABEL_Y + SIDE_LABEL_H;
const NEXT_LABEL_Y = HOLD_BOX_Y + SIDE_BOX_H + 12;
const NEXT_BOX_Y = NEXT_LABEL_Y + SIDE_LABEL_H;

// Incoming-garbage telegraph: a thin bar hugging the left edge of my board.
const TELE_W = 6;
const TELE_X = MY_X - 9;

/** Cell fill colors as packed ints, parsed once at module load — avoids
 *  re-parsing a hex string for every cell on every frame (×2 boards, ×2 windows). */
const CELL_COLOR_INT: Record<PieceType | 'G', number> = (() => {
  const keys: (PieceType | 'G')[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L', 'G'];
  const out = {} as Record<PieceType | 'G', number>;
  for (const k of keys) out[k] = Phaser.Display.Color.HexStringToColor(cellColor(k)).color;
  return out;
})();

export class VersusScene extends Phaser.Scene {
  private roomClient!: RoomClient;
  private mySessionId = '';
  private snapshot!: RoomStateSnapshot;

  private staticGfx!: Phaser.GameObjects.Graphics;
  private dynGfx!: Phaser.GameObjects.Graphics;
  private countdownText!: Phaser.GameObjects.Text;
  private countdownTimer?: Phaser.Time.TimerEvent;
  private hudEl: HTMLDivElement | null = null;
  private hudMeEl: HTMLElement | null = null;
  private hudOppEl: HTMLElement | null = null;
  private hudMeterEl: HTMLElement | null = null;
  /** A fresh snapshot arrived — consume it in update() so we redraw at most once
   *  per animation frame instead of once per (≈30 Hz) network message. */
  private dirty = false;

  private sfx!: Sfx;
  private shake!: CameraShake;
  private flames!: FlameEmitter;
  private embers!: EmberEmitter;
  private currentFxTier: 0 | 1 | 2 | 3 = 0;
  private prevTier: 0 | 1 | 2 | 3 = 0;
  private unbindInput?: () => void;
  private prevLockTicks = new Map<string, number>();

  /** Set when we navigate away on purpose — stops the disconnect/reconnect UI. */
  private leaving = false;
  private reconnecting = false;
  private musicStarted = false;
  private matchOverDone = false;

  constructor() {
    super('Versus');
  }

  init(data: VersusData): void {
    this.roomClient = data.roomClient;
    this.mySessionId = data.mySessionId;
    this.snapshot = data.initialSnapshot;
    // Phaser reuses the scene instance across matches — reset all per-match state.
    this.leaving = false;
    this.reconnecting = false;
    this.musicStarted = false;
    this.matchOverDone = false;
    this.currentFxTier = 0;
    this.prevTier = 0;
    this.dirty = false;
    this.prevLockTicks.clear();
  }

  create(): void {
    this.scale.resize(CANVAS_W, CANVAS_H);
    document.body.classList.add('versus-stage');
    hideOverlay();

    ensureTextures(this);
    this.cameras.main.setBackgroundColor('#07001a');
    // Two layers: frames + grid lines never change during a match, so they're
    // drawn once. Only cells/pieces are re-issued, and only when state changes.
    this.staticGfx = this.add.graphics().setDepth(0);
    this.dynGfx = this.add.graphics().setDepth(1);
    this.drawStatic();
    this.addRailLabels();

    this.flames = new FlameEmitter(this, MY_X + MY_W / 2, MY_Y, MY_W, MY_H);
    this.embers = new EmberEmitter(this, MY_X + MY_W / 2, MY_Y, MY_W, MY_H);
    this.shake = new CameraShake(this.cameras.main);

    this.countdownText = this.add.text(MY_X + MY_W / 2, MY_Y + MY_H / 2, '', {
      fontFamily: 'Anton, sans-serif',
      fontSize: '160px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(30).setShadow(0, 0, '#ff2e93', 28, true, true).setVisible(false);

    this.sfx = new Sfx(this.sound);
    if (loadMuted()) this.sfx.setMuted(true);
    setActiveSfx(this.sfx);

    this.mountHud();
    this.roomClient.onLeave(() => this.onServerLeave());
    this.roomClient.setListener((snap) => this.onSnapshot(snap));

    const bindings: InputBindings = {
      onMoveLeft: () => this.send({ type: 'move', dir: -1 }),
      onMoveRight: () => this.send({ type: 'move', dir: 1 }),
      onSoftDrop: () => this.send({ type: 'softDrop' }),
      onHardDrop: () => this.send({ type: 'hardDrop' }),
      onRotateCW: () => this.send({ type: 'rotate', dir: 1 }),
      onRotateCCW: () => this.send({ type: 'rotate', dir: -1 }),
      onHold: () => this.send({ type: 'hold' }),
      onPauseToggle: () => { /* no pause in versus */ },
      onReset: () => { /* no reset in versus */ },
      onMuteToggle: () => { this.sfx.toggleMute(); syncAudioUI(); },
      onStart: () => { /* nothing — versus is server-driven */ },
    };
    this.unbindInput = bindInput(bindings);

    const touchMount = document.getElementById('touch-controls-mount');
    if (touchMount) {
      touchMount.innerHTML = '';
      touchMount.appendChild(mountTouchControls(bindings));
    }

    this.drawDynamic();
    this.updateHud();
    if (this.snapshot.phase === 'countdown') this.startCountdownDisplay(this.snapshot);
    else if (this.snapshot.phase === 'playing') this.startMusicOnce();
    else if (this.snapshot.phase === 'finished') this.onMatchOver(this.snapshot);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private send(partial: Omit<ClientInput, 'tick'>): void {
    if (this.snapshot.phase !== 'playing') return;
    const me = this.findMe();
    if (!me || me.gameState.status !== 'playing') return;
    this.roomClient.sendInput({ ...partial, tick: this.snapshot.tick });
  }

  /** Network callback — fires up to ~30×/s. Keep it cheap: stash the snapshot and
   *  fire one-shot audio, then let update() coalesce the redraw to the frame rate. */
  private onSnapshot(snap: RoomStateSnapshot): void {
    const prevPhase = this.snapshot?.phase;
    this.snapshot = snap;
    this.applyClearFx(snap);
    this.dirty = true;
    if (snap.phase === 'playing' && prevPhase !== 'playing') this.onPlayingStart();
    // Once I'm out, kill the persistent fire even if the match is still live.
    const me = this.findMe();
    if (me && me.gameState.status === 'dead' && this.currentFxTier !== 0) this.applyTier(0);
    if (snap.phase === 'finished') {
      this.applyTier(0);
      this.onMatchOver(snap);
    }
  }

  override update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.drawDynamic();
    this.updateHud();
  }

  // ---------- countdown ----------

  private startCountdownDisplay(snap: RoomStateSnapshot): void {
    const remainingTicks = (snap.startsAtTick ?? snap.tick + COUNTDOWN_TICKS) - snap.tick;
    let n = Math.max(1, Math.round(remainingTicks / VERSUS_TICK_HZ));
    setStatus('get ready…');
    this.popCountdown(String(n));
    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      repeat: n - 1,
      callback: () => {
        n -= 1;
        if (n > 0) this.popCountdown(String(n));
      },
    });
  }

  private onPlayingStart(): void {
    this.countdownTimer?.remove();
    this.countdownTimer = undefined;
    this.popCountdown('GO!');
    this.time.delayedCall(550, () => this.countdownText.setVisible(false));
    this.startMusicOnce();
  }

  private startMusicOnce(): void {
    if (this.musicStarted) return;
    this.musicStarted = true;
    this.sfx.startMusic();
  }

  private popCountdown(text: string): void {
    this.countdownText.setText(text).setVisible(true).setScale(1.7).setAlpha(1);
    this.tweens.add({ targets: this.countdownText, scale: 1, duration: 320, ease: 'Back.Out' });
  }

  // ---------- clear / juice ----------

  private applyClearFx(snap: RoomStateSnapshot): void {
    const me = snap.players.find((p) => p.sessionId === this.mySessionId);
    if (!me?.lastLockEvent) return;
    // lastLockEvent is set for one tick; dedupe so a re-broadcast of the same tick
    // doesn't double-fire FX.
    if (this.prevLockTicks.get(me.sessionId) === snap.tick) return;
    this.prevLockTicks.set(me.sessionId, snap.tick);

    const ev = me.lastLockEvent;
    if (ev.linesCleared > 0) {
      const tier = fxTier(ev.intensity);
      this.applyTier(tier);
      this.bursts(tier);
      this.sfx.playClear(tier);
      if (tier > this.prevTier) this.prevTier = tier;

      const lines = ev.linesCleared as 1 | 2 | 3 | 4;
      const phrases = CLEAR_PHRASES[lines];
      const kind: ReactionKind = lines >= 4 ? 'hot' : lines >= 3 ? 'lime' : 'yel';
      const size: ReactionSize = lines >= 4 ? 'huge' : lines >= 3 ? 'big' : '';
      flash(pickRandom(phrases), kind, Math.random() * 20 - 10, size);
      if (ev.newCombo >= 2) flash(`${ev.newCombo + 1}× MOG STREAK`, 'cyan', 8, 'small');
      if (ev.leveledUp) flash(`LEVEL ${ev.newLevel} · SPEED UP 🏃`, 'cyan', -8, 'big');
    } else {
      const prev = this.currentFxTier;
      this.applyTier(0);
      if (prev > 0 || this.prevTier > 0) {
        this.sfx.playStreakLoss();
        flash(pickRandom(STREAK_LOSS_MSGS), '', 0, 'small');
        this.prevTier = 0;
      }
    }
  }

  private applyTier(tier: 0 | 1 | 2 | 3): void {
    if (tier === this.currentFxTier) return;
    const prev = this.currentFxTier;
    this.currentFxTier = tier;
    setBgTier(tier);
    this.shake.setTier(tier);
    this.flames.setTier(tier);
    this.embers.setTier(tier);
    if (tier > prev) {
      if (tier === 1) flash('HEATING UP 🔥', 'yel', -8, 'big');
      else if (tier === 2) flash('COOKING 🔥🔥', 'hot', 5, 'big');
      else if (tier === 3) flash('BOARD IS COOKED 🔥🔥🔥', 'fire', -3, 'huge');
    }
  }

  private bursts(tier: 0 | 1 | 2 | 3): void {
    if (tier === 0) return;
    const counts: Record<1 | 2 | 3, number> = { 1: 6, 2: 14, 3: 28 };
    this.embers.burst(counts[tier as 1 | 2 | 3]);
    this.shake.burst(tier === 3 ? 0.012 : tier === 2 ? 0.006 : 0.003, 200);
  }

  // ---------- render ----------

  /** Static layer — frames + grid lines + rail boxes. Drawn once in create();
   *  never cleared per frame. */
  private drawStatic(): void {
    this.staticGfx.clear();
    this.drawFrame(MY_X, MY_Y, MY_W, MY_H, /*hot*/ true);
    this.drawFrame(OPP_X, OPP_Y, OPP_W, OPP_H, /*hot*/ false);
    this.drawGrid(MY_X, MY_Y, MY_CELL);
    this.drawGrid(OPP_X, OPP_Y, OPP_CELL);
    this.drawMiniBox(SIDE_X, HOLD_BOX_Y, SIDE_W, SIDE_BOX_H);
    this.drawMiniBox(SIDE_X, NEXT_BOX_Y, SIDE_W, SIDE_BOX_H);
  }

  private addRailLabels(): void {
    const style = {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '10px',
      color: 'rgba(255,255,255,0.5)',
    } as Phaser.Types.GameObjects.Text.TextStyle;
    this.add.text(SIDE_X, HOLD_LABEL_Y, 'HOLD', style).setDepth(2);
    this.add.text(SIDE_X, NEXT_LABEL_Y, 'NEXT', style).setDepth(2);
  }

  /** Dynamic layer — settled cells, ghost, live piece, hold/next, and the
   *  garbage telegraph. Re-issued only when a snapshot changes the state. */
  private drawDynamic(): void {
    this.dynGfx.clear();
    const me = this.findMe();
    this.drawCells(MY_X, MY_Y, MY_CELL, me, /*ghost*/ true);
    this.drawCells(OPP_X, OPP_Y, OPP_CELL, this.findOpp(), /*ghost*/ false);
    if (me) {
      if (me.gameState.hold) this.drawPieceInBox(SIDE_X, HOLD_BOX_Y, SIDE_W, SIDE_BOX_H, me.gameState.hold);
      const nx = me.gameState.queue[0];
      if (nx) this.drawPieceInBox(SIDE_X, NEXT_BOX_Y, SIDE_W, SIDE_BOX_H, nx);
      this.drawTelegraph(me);
    }
  }

  /** Rounded panel frame around a board area — drawn inside the Phaser canvas
   *  so it scales with the renderer instead of relying on outer CSS chrome. */
  private drawFrame(x: number, y: number, w: number, h: number, hot: boolean): void {
    const radius = 10;
    const g = this.staticGfx;
    // soft inner background tint
    g.fillStyle(0x07001a, 1);
    g.fillRoundedRect(x, y, w, h, radius);
    // halo: 3 progressively wider strokes for a faux glow
    const haloColor = hot ? 0xff2e93 : 0x29e4ff;
    for (let i = 3; i >= 1; i--) {
      g.lineStyle(i * 2, haloColor, 0.05 * i);
      g.strokeRoundedRect(x - i, y - i, w + i * 2, h + i * 2, radius + i);
    }
    // crisp 1px outline
    g.lineStyle(1.2, 0xffffff, 0.35);
    g.strokeRoundedRect(x, y, w, h, radius);
  }

  private drawMiniBox(x: number, y: number, w: number, h: number): void {
    const g = this.staticGfx;
    g.fillStyle(0xffffff, 0.03);
    g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(1, 0xffffff, 0.12);
    g.strokeRoundedRect(x, y, w, h, 8);
  }

  private drawGrid(ox: number, oy: number, cell: number): void {
    const g = this.staticGfx;
    g.lineStyle(1, 0xffffff, 0.04);
    for (let c = 1; c < COLS; c++) {
      g.lineBetween(ox + c * cell, oy, ox + c * cell, oy + ROWS * cell);
    }
    for (let r = 1; r < ROWS; r++) {
      g.lineBetween(ox, oy + r * cell, ox + COLS * cell, oy + r * cell);
    }
  }

  private drawCells(
    ox: number,
    oy: number,
    cell: number,
    p: PlayerVersusState | undefined,
    drawGhost: boolean,
  ): void {
    if (!p) return;
    const g = p.gameState;
    for (let r = 0; r < ROWS; r++) {
      const row = g.grid[r];
      for (let c = 0; c < COLS; c++) {
        const v = row[c];
        if (v === 0) continue;
        this.cell(ox, oy, c, r, cell, v, false);
      }
    }
    if (g.status === 'playing') {
      if (drawGhost) {
        const ghost = this.ghostFor(g.current, g.grid);
        this.piece(ox, oy, cell, ghost.type, ghost.x, ghost.y, ghost.rot, true);
      }
      this.piece(ox, oy, cell, g.current.type, g.current.x, g.current.y, g.current.rot, false);
    }
  }

  /** Incoming-garbage warning bar: one segment per queued line, stacked from the
   *  board floor. Cancelable lines glow amber; lines past two-thirds of the cancel
   *  window glow a pulsing red to signal they're about to land. */
  private drawTelegraph(p: PlayerVersusState): void {
    if (p.attackQueue.length === 0) return;
    const g = this.dynGfx;
    const segH = MY_CELL;
    const floor = MY_Y + MY_H;
    const tick = this.snapshot.tick;
    const pulse = 0.78 + 0.22 * Math.sin(performance.now() / 90);
    let line = 0;
    for (const entry of p.attackQueue) {
      const ready = Math.min(1, (tick - entry.arrivedAt) / CANCEL_WINDOW_TICKS);
      const imminent = ready >= 0.66;
      for (let i = 0; i < entry.lines && line < ROWS; i++, line++) {
        const top = floor - (line + 1) * segH + 2;
        g.fillStyle(imminent ? 0xff2e2e : 0xffae00, imminent ? pulse : 0.7);
        g.fillRoundedRect(TELE_X, top, TELE_W, segH - 3, 2);
      }
    }
  }

  private piece(
    ox: number, oy: number, cell: number,
    type: PieceType, x: number, y: number, rot: number, ghost: boolean,
  ): void {
    const s = SHAPES[type][rot as 0 | 1 | 2 | 3];
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const yy = y + r;
        if (yy < 0) continue;
        this.cell(ox, oy, x + c, yy, cell, type, ghost);
      }
    }
  }

  /** Draws a piece centered inside a rail box (Hold / Next), using its spawn shape. */
  private drawPieceInBox(boxX: number, boxY: number, boxW: number, boxH: number, type: PieceType): void {
    const s = SHAPES[type][0];
    let minR = s.length, maxR = -1, minC = s[0].length, maxC = -1;
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
    if (maxR < 0) return;
    const pw = maxC - minC + 1;
    const ph = maxR - minR + 1;
    const ox = boxX + (boxW - pw * MINI_CELL) / 2 - minC * MINI_CELL;
    const oy = boxY + (boxH - ph * MINI_CELL) / 2 - minR * MINI_CELL;
    const color = CELL_COLOR_INT[type];
    const g = this.dynGfx;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (!s[r][c]) continue;
        const px = ox + c * MINI_CELL;
        const py = oy + r * MINI_CELL;
        g.fillStyle(color, 1);
        g.fillRoundedRect(px + 1, py + 1, MINI_CELL - 2, MINI_CELL - 2, 3);
        g.fillStyle(0xffffff, 0.25);
        g.fillRoundedRect(px + 2, py + 2, MINI_CELL - 4, (MINI_CELL - 4) / 2, 2);
      }
    }
  }

  private cell(
    ox: number, oy: number, col: number, row: number, cell: number,
    value: CellValue, ghost: boolean,
  ): void {
    if (value === 0) return;
    const color = CELL_COLOR_INT[value];
    const px = ox + col * cell;
    const py = oy + row * cell;
    const g = this.dynGfx;
    if (ghost) {
      g.lineStyle(1.2, color, 0.55);
      g.strokeRoundedRect(px + 2, py + 2, cell - 4, cell - 4, 4);
      g.fillStyle(color, 0.13);
      g.fillRoundedRect(px + 2, py + 2, cell - 4, cell - 4, 4);
      return;
    }
    g.fillStyle(color, 1);
    g.fillRoundedRect(px + 1, py + 1, cell - 2, cell - 2, Math.max(2, cell / 6));
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(px + 2, py + 2, cell - 4, Math.max(2, (cell - 4) / 2), Math.max(1, cell / 10));
    g.fillStyle(0x000000, 0.32);
    g.fillRect(px + cell - 4, py + 3, 2, cell - 6);
    g.fillRect(px + 3, py + cell - 4, cell - 6, 2);
  }

  private ghostFor(piece: { type: PieceType; rot: number; x: number; y: number }, grid: CellValue[][]) {
    let y = piece.y;
    while (!this.collidesAt(piece.type, piece.rot, piece.x, y + 1, grid)) y++;
    return { ...piece, y };
  }

  private collidesAt(type: PieceType, rot: number, x: number, y: number, grid: CellValue[][]): boolean {
    const s = SHAPES[type][rot as 0 | 1 | 2 | 3];
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const nx = x + c;
        const ny = y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx] !== 0) return true;
      }
    }
    return false;
  }

  // ---------- HUD ----------

  private mountHud(): void {
    const stage = document.querySelector('.stage');
    if (!stage) return;
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'versus-hud';
    this.hudEl.innerHTML = `
      <span class="vs-me">you</span>
      <div class="vs-meter" title="incoming attack"><i></i></div>
      <span class="vs-opp">opp</span>
    `;
    stage.insertBefore(this.hudEl, stage.firstChild);
    // Cache child refs once instead of re-querying on every HUD update.
    this.hudMeEl = this.hudEl.querySelector('.vs-me');
    this.hudOppEl = this.hudEl.querySelector('.vs-opp');
    this.hudMeterEl = this.hudEl.querySelector('.vs-meter > i');
  }

  private updateHud(): void {
    const me = this.findMe();
    const opp = this.findOpp();
    if (this.hudMeEl && me) this.hudMeEl.textContent = `${me.handle} · ${me.gameState.score.toLocaleString()}`;
    if (this.hudOppEl && opp) this.hudOppEl.textContent = `${opp.disconnected ? '(disconnected) ' : ''}${opp.handle} · ${opp.gameState.score.toLocaleString()}`;
    if (this.hudMeterEl && me) {
      const incoming = me.attackQueue.reduce((acc, e) => acc + e.lines, 0);
      const pct = Math.min(100, incoming * 12);
      this.hudMeterEl.style.width = pct + '%';
    }
    const phaseLabel = this.snapshot.phase === 'playing' ? 'cooking…'
      : this.snapshot.phase === 'countdown' ? 'get ready…'
      : this.snapshot.phase;
    setStatus(phaseLabel);
  }

  private findMe(): PlayerVersusState | undefined {
    return this.snapshot.players.find((p) => p.sessionId === this.mySessionId);
  }

  private findOpp(): PlayerVersusState | undefined {
    return this.snapshot.players.find((p) => p.sessionId !== this.mySessionId);
  }

  // ---------- end ----------

  /** Versus game-over: every client plays the mog song, mogface fades in and
   *  flashes TV static, then the result card slides in once the drama lands. */
  private onMatchOver(snap: RoomStateSnapshot): void {
    if (this.matchOverDone) return;
    this.matchOverDone = true;
    this.sfx.playMog(); // stops the loop + plays the mog song once
    showMogTakeover();
    this.time.delayedCall(1900, () => {
      if (!this.leaving) this.showResult(snap);
    });
  }

  private showResult(snap: RoomStateSnapshot): void {
    if (!snap.result) return;
    const me = this.findMe();
    const won = snap.result.winnerHandle && me && snap.result.winnerHandle === me.handle;
    const title = snap.result.reason === 'draw' ? "BOTH OF Y'ALL FELL OFF" : won ? 'YOU MOGGED THEM' : 'YOU GOT MOGGED';
    const sub = snap.result.players
      .map((p) => `<b>${escapeHtml(p.handle)}</b>: ${p.score.toLocaleString()} rizz · ${p.attackSent} sent · ${p.attackReceived} eaten`)
      .join('<br>');
    const myHandle = me?.handle ?? '';
    this.showChoiceOverlay({
      title,
      subHtml: sub + '<br><br>run it back?',
      primaryText: 'REMATCH',
      onPrimary: () => this.toRematch(myHandle),
    });
  }

  private onServerLeave(): void {
    if (this.leaving || this.snapshot.phase === 'finished') return;
    // The WS dropped mid-match. The server holds the slot open for
    // RECONNECT_SECONDS — try to slide back in before declaring it lost.
    void this.attemptReconnect();
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    const opp = this.findOpp();
    this.showChoiceOverlay({
      title: 'RECONNECTING…',
      subHtml: `wifi blinked? sliding back in before <b>${escapeHtml(opp?.handle ?? 'your opp')}</b> claims the W.`,
      primaryText: 'GIVE UP',
      onPrimary: () => { this.reconnecting = false; this.toMenu(); },
    });

    const deadline = Date.now() + RECONNECT_SECONDS * 1000;
    while (Date.now() < deadline && this.reconnecting && !this.leaving) {
      const ok = await this.roomClient.reconnect();
      if (this.leaving) { this.reconnecting = false; return; }
      if (ok) {
        this.reconnecting = false;
        this.mySessionId = this.roomClient.sessionId ?? this.mySessionId;
        hideOverlay();
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (this.reconnecting) {
      this.reconnecting = false;
      this.connectionLost();
    }
  }

  private connectionLost(): void {
    const phaseHint = this.snapshot.phase === 'playing'
      ? 'mid-match disconnect — likely the tab went to sleep or wifi blinked.'
      : 'connection dropped before the match started.';
    this.showChoiceOverlay({
      title: 'CONNECTION LOST',
      subHtml: `${phaseHint}<br>your opp gets the W by default.`,
      primaryText: 'BACK TO MENU',
      onPrimary: () => this.toMenu(),
    });
  }

  /** Shows the DOM overlay with a primary button and an optional secondary
   *  (BACK TO MENU). Wires/cleans listeners on the shared #ov-btn / #ov-btn-vs. */
  private showChoiceOverlay(opts: {
    title: string;
    subHtml: string;
    primaryText: string;
    onPrimary: () => void;
    secondary?: boolean;
  }): void {
    const secondary = opts.secondary ?? true;
    showOverlay({ title: opts.title, subHtml: opts.subHtml, btnText: opts.primaryText, showHandleInput: false });
    const primary = document.getElementById('ov-btn');
    const menuBtn = document.getElementById('ov-btn-vs');
    this.clearOverlayHandlers();
    if (primary) {
      this.primaryHandler = () => opts.onPrimary();
      primary.addEventListener('click', this.primaryHandler);
    }
    if (menuBtn instanceof HTMLButtonElement) {
      if (secondary && opts.primaryText !== 'BACK TO MENU') {
        menuBtn.textContent = 'BACK TO MENU';
        menuBtn.style.display = 'block';
        this.menuHandler = () => this.toMenu();
        menuBtn.addEventListener('click', this.menuHandler);
      } else {
        menuBtn.style.display = 'none';
      }
    }
  }

  private primaryHandler?: () => void;
  private menuHandler?: () => void;

  private clearOverlayHandlers(): void {
    const primary = document.getElementById('ov-btn');
    const menuBtn = document.getElementById('ov-btn-vs');
    if (primary && this.primaryHandler) primary.removeEventListener('click', this.primaryHandler);
    if (menuBtn && this.menuHandler) menuBtn.removeEventListener('click', this.menuHandler);
    this.primaryHandler = undefined;
    this.menuHandler = undefined;
  }

  private toMenu(): void {
    this.leaving = true;
    this.scene.start('Menu');
  }

  private toRematch(handle: string): void {
    this.leaving = true;
    this.scene.start('Lobby', { handle });
  }

  private teardown(): void {
    this.leaving = true;
    this.reconnecting = false;
    this.countdownTimer?.remove();
    this.clearOverlayHandlers();
    const menuBtn = document.getElementById('ov-btn-vs');
    if (menuBtn instanceof HTMLButtonElement) {
      // Restore the Menu's button to its original purpose — we borrowed it as a
      // secondary "BACK TO MENU" on the result/disconnect overlays.
      menuBtn.style.display = 'none';
      menuBtn.textContent = '1v1 VERSUS';
    }
    this.unbindInput?.();
    this.hudEl?.remove();
    this.hudEl = null;
    this.hudMeEl = this.hudOppEl = this.hudMeterEl = null;
    const touchMount = document.getElementById('touch-controls-mount');
    if (touchMount) touchMount.innerHTML = '';
    document.body.classList.remove('versus-stage');
    hideMogTakeover();
    // Drop any lingering brainrot FX so they don't bleed into the next scene.
    setBgTier(0);
    this.shake?.stop();
    this.flames?.destroy();
    this.embers?.destroy();
    this.sfx?.stopMusic();
    this.scale.resize(300, 600);
    this.roomClient.leave();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]!));
}
