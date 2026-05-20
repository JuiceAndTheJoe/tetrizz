import Phaser from 'phaser';
import {
  createGame, fxTier, inputHardDrop, inputHold, inputMove, inputRotate,
  inputSoftDrop, META, SHAPES, tickGravity,
  COLS, ROWS,
  type GameState, type LockEvent, type Piece, type PieceType,
} from '@tetrizz/shared';
import { Sfx, exposeTuneHelpers } from '../audio/sfx.ts';
import { bindInput } from '../input.ts';
import { loadBest, loadHandle, loadMuted, normalizeHandle, saveBest, saveHandle } from '../persistence/store.ts';
import { setBgTier } from '../fx/bgglow.ts';
import { CameraShake } from '../fx/shake.ts';
import { EmberEmitter } from '../fx/embers.ts';
import { FlameEmitter } from '../fx/flames.ts';
import { ensureTextures } from '../fx/textures.ts';
import { CLEAR_PHRASES, STREAK_LOSS_MSGS, pickRandom } from '../ui/phrases.ts';
import { pushChat, seedChat } from '../ui/chat.ts';
import { flash, type ReactionKind, type ReactionSize } from '../ui/reactions.ts';
import { setHandle, setHold, setNext, setScoreboard, setStatus } from '../ui/hud.ts';
import { getOverlay, hideOverlay, showOverlay } from '../ui/overlay.ts';
import { mountTouchControls } from '../ui/touch.ts';
import { fetchLeaderboard, submitScore } from '../ui/leaderboard.ts';

const CELL = 30;
const BOARD_X = 0;
const BOARD_Y = 0;

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private boardGfx!: Phaser.GameObjects.Graphics;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private pieceGfx!: Phaser.GameObjects.Graphics;
  private gridGfx!: Phaser.GameObjects.Graphics;

  private sfx!: Sfx;
  private shake!: CameraShake;
  private flames!: FlameEmitter;
  private embers!: EmberEmitter;

  private running = false;
  private paused = false;
  private dead = false;
  private currentFxTier: 0 | 1 | 2 | 3 = 0;
  private gravityAccumulator = 0;

  private best = 0;
  private sessionStartBest = 0;
  private highScoreAnnounced = false;
  private handle: string | null = null;

  private unbindInput?: () => void;

  constructor() {
    super('Game');
  }

  create(): void {
    ensureTextures(this);
    this.cameras.main.setBackgroundColor('#07001a');

    this.gridGfx = this.add.graphics().setDepth(1);
    this.boardGfx = this.add.graphics().setDepth(2);
    this.ghostGfx = this.add.graphics().setDepth(3);
    this.pieceGfx = this.add.graphics().setDepth(4);

    this.flames = new FlameEmitter(this, COLS * CELL / 2, BOARD_Y, COLS * CELL, ROWS * CELL);
    this.embers = new EmberEmitter(this, COLS * CELL / 2, BOARD_Y, COLS * CELL, ROWS * CELL);
    this.shake = new CameraShake(this.cameras.main);

    this.sfx = new Sfx(this.sound);
    exposeTuneHelpers();

    this.best = loadBest();
    this.handle = loadHandle();
    this.sessionStartBest = this.best;

    setHandle(this.handle);
    this.drawStaticGrid();
    this.resetState(); // populate state for the preview behind the overlay
    this.renderAll();
    this.hudFromState();

    this.setupOverlay();
    this.setupMuteButton();
    const bindings = {
      onMoveLeft: () => this.handleInput((s) => inputMove(s, -1)),
      onMoveRight: () => this.handleInput((s) => inputMove(s, 1)),
      onSoftDrop: () => this.handleStepInput((s) => inputSoftDrop(s)),
      onHardDrop: () => this.handleStepInput((s) => inputHardDrop(s)),
      onRotateCW: () => this.handleInput((s) => inputRotate(s, 1)),
      onRotateCCW: () => this.handleInput((s) => inputRotate(s, -1)),
      onHold: () => this.handleInput((s) => inputHold(s)),
      onPauseToggle: () => this.togglePause(),
      onReset: () => this.startGame(),
      onMuteToggle: () => this.toggleMute(),
      onStart: () => { if (!this.running) this.startFromOverlay(); },
    };
    this.unbindInput = bindInput(bindings);

    const touchMount = document.getElementById('touch-controls-mount');
    if (touchMount && touchMount.childElementCount === 0) {
      touchMount.appendChild(mountTouchControls(bindings));
    }

    seedChat(3);
    void fetchLeaderboard();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unbindInput?.());
  }

  override update(_time: number, deltaMs: number): void {
    if (!this.running || this.paused || this.dead) return;
    this.gravityAccumulator += deltaMs;
    while (this.gravityAccumulator >= this.state.dropIntervalMs) {
      this.gravityAccumulator -= this.state.dropIntervalMs;
      const r = tickGravity(this.state);
      this.state = r.state;
      if (r.lockEvent) this.onLock(r.lockEvent);
      if (this.dead) break;
    }
    this.renderAll();
  }

  // ---------- state mutation hooks ----------

  private handleInput(transform: (s: GameState) => GameState): void {
    if (!this.running || this.paused || this.dead) return;
    this.state = transform(this.state);
    this.renderAll();
  }

  private handleStepInput(transform: (s: GameState) => { state: GameState; lockEvent?: LockEvent }): void {
    if (!this.running || this.paused || this.dead) return;
    const r = transform(this.state);
    this.state = r.state;
    if (r.lockEvent) this.onLock(r.lockEvent);
    this.renderAll();
  }

  private onLock(ev: LockEvent): void {
    if (ev.linesCleared > 0) {
      const tier = fxTier(ev.intensity);
      this.applyTier(tier);
      this.bursts(tier);
      this.sfx.playClear(tier);

      const lines = ev.linesCleared as 1 | 2 | 3 | 4;
      const phrases = CLEAR_PHRASES[lines];
      const reactionKind: ReactionKind = lines >= 4 ? 'hot' : lines >= 3 ? 'lime' : 'yel';
      const reactionSize: ReactionSize = lines >= 4 ? 'huge' : lines >= 3 ? 'big' : '';
      flash(pickRandom(phrases), reactionKind, Math.random() * 20 - 10, reactionSize);

      if (ev.newCombo >= 2) {
        flash(`${ev.newCombo + 1}× MOG STREAK`, 'cyan', 8, 'small');
      }
      if (ev.leveledUp) {
        flash(`LEVEL ${ev.newLevel} · SPEED UP 🏃`, 'cyan', -8, 'big');
      }
      pushChat();
    } else {
      const prevTier = this.currentFxTier;
      this.applyTier(0);
      if (prevTier > 0) {
        this.sfx.playStreakLoss();
        flash(pickRandom(STREAK_LOSS_MSGS), '', 0, 'small');
      }
    }

    if (this.state.score > this.best) {
      this.best = this.state.score;
      saveBest(this.best);
    }
    if (!this.highScoreAnnounced && this.sessionStartBest > 0 && this.state.score > this.sessionStartBest) {
      this.highScoreAnnounced = true;
      this.sfx.playHighScore();
      flash('NEW HIGH SCORE 🚨', 'cyan', -4, 'huge');
    }

    if (ev.topOut || this.state.status === 'dead') {
      this.onDie();
    }

    this.hudFromState();
  }

  // ---------- tier FX ----------

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

  private drawStaticGrid(): void {
    this.gridGfx.clear();
    this.gridGfx.lineStyle(1, 0xffffff, 0.04);
    for (let c = 1; c < COLS; c++) {
      this.gridGfx.lineBetween(BOARD_X + c * CELL, BOARD_Y, BOARD_X + c * CELL, BOARD_Y + ROWS * CELL);
    }
    for (let r = 1; r < ROWS; r++) {
      this.gridGfx.lineBetween(BOARD_X, BOARD_Y + r * CELL, BOARD_X + COLS * CELL, BOARD_Y + r * CELL);
    }
  }

  private renderAll(): void {
    this.boardGfx.clear();
    this.ghostGfx.clear();
    this.pieceGfx.clear();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.state.grid[r][c];
        if (v === 0) continue;
        this.drawCell(this.boardGfx, c, r, META[v as PieceType].color, false);
      }
    }

    if (!this.dead) {
      const ghost = this.ghost(this.state.current);
      this.drawPiece(this.ghostGfx, ghost, true);
      this.drawPiece(this.pieceGfx, this.state.current, false);
    }
  }

  private ghost(p: Piece): Piece {
    let y = p.y;
    while (!this.collidesAt({ ...p, y: y + 1 })) y++;
    return { ...p, y };
  }

  private collidesAt(p: Piece): boolean {
    const s = SHAPES[p.type][p.rot];
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const nx = p.x + c;
        const ny = p.y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && this.state.grid[ny][nx] !== 0) return true;
      }
    }
    return false;
  }

  private drawPiece(gfx: Phaser.GameObjects.Graphics, p: Piece, ghost: boolean): void {
    const s = SHAPES[p.type][p.rot];
    const color = META[p.type].color;
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const y = p.y + r;
        if (y < 0) continue;
        this.drawCell(gfx, p.x + c, y, color, ghost);
      }
    }
  }

  private drawCell(gfx: Phaser.GameObjects.Graphics, col: number, row: number, hexColor: string, ghost: boolean): void {
    const px = BOARD_X + col * CELL;
    const py = BOARD_Y + row * CELL;
    const color = Phaser.Display.Color.HexStringToColor(hexColor).color;
    if (ghost) {
      gfx.lineStyle(1.2, color, 0.55);
      gfx.strokeRoundedRect(px + 2, py + 2, CELL - 4, CELL - 4, 4);
      gfx.fillStyle(color, 0.13);
      gfx.fillRoundedRect(px + 2, py + 2, CELL - 4, CELL - 4, 4);
      return;
    }
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(px + 1, py + 1, CELL - 2, CELL - 2, 5);
    // top highlight
    gfx.fillStyle(0xffffff, 0.28);
    gfx.fillRoundedRect(px + 2, py + 2, CELL - 4, (CELL - 4) / 2, 3);
    // bottom + right shadow streaks
    gfx.fillStyle(0x000000, 0.32);
    gfx.fillRect(px + CELL - 4, py + 3, 2, CELL - 6);
    gfx.fillRect(px + 3, py + CELL - 4, CELL - 6, 2);
  }

  // ---------- HUD wiring ----------

  private hudFromState(): void {
    setScoreboard({
      score: this.state.score,
      lines: this.state.lines,
      level: this.state.level,
      combo: this.state.combo,
      best: this.best,
    });
    setHold(this.state.hold);
    setNext(this.state.queue);
  }

  // ---------- lifecycle ----------

  private resetState(): void {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    this.state = createGame(seed);
    this.gravityAccumulator = 0;
    this.dead = false;
    this.paused = false;
    this.currentFxTier = 0;
    this.highScoreAnnounced = false;
    this.sessionStartBest = this.best;
    setBgTier(0);
    this.shake.setTier(0);
    this.flames.setTier(0);
    this.embers.setTier(0);
  }

  private startGame(): void {
    this.resetState();
    this.running = true;
    hideOverlay();
    setStatus('cooking…');
    this.hudFromState();
    this.renderAll();
  }

  private startFromOverlay(): void {
    const input = getOverlay().handleInput;
    if (input.style.display !== 'none') {
      const normalized = normalizeHandle(input.value);
      if (normalized) {
        // Switching handles wipes the personal best — it belongs to whoever was playing before.
        if (normalized !== this.handle) {
          this.best = 0;
          saveBest(0);
        }
        this.handle = normalized;
        saveHandle(normalized);
        setHandle(normalized);
      }
    }
    this.startGame();
  }

  private togglePause(): void {
    if (!this.running || this.dead) return;
    this.paused = !this.paused;
    if (this.paused) {
      showOverlay({
        title: 'BRB MEWING',
        subHtml: 'paused. hit <b>P</b>/<b>Esc</b> or click to lock back in.',
        btnText: 'RESUME COOKING',
        showHandleInput: false,
      });
      setStatus('paused');
    } else {
      hideOverlay();
      setStatus('cooking…');
    }
  }

  private onDie(): void {
    this.running = false;
    this.dead = true;
    this.applyTier(0);
    flash('YOU GOT THE ICK 💀', 'hot', -8, 'big');
    const final = this.state.score;
    const isNewBest = this.sessionStartBest > 0 && final > this.sessionStartBest;
    const tail = isNewBest ? "new BEST. ur him." : 'ratio. skill issue. try again.';
    setStatus('L taken · press to retry');

    // Submit score if the player has a handle and actually scored something.
    if (this.handle && final > 0) {
      void submitScore({
        handle: this.handle,
        score: final,
        lines: this.state.lines,
        level: this.state.level,
      });
    }

    // Let the death reaction breathe before the overlay covers it (.reactions z:5 vs .overlay z:6).
    this.time.delayedCall(1100, () => {
      if (!this.dead) return; // user already restarted during the breath
      showOverlay({
        title: 'YOU FELL OFF',
        subHtml: `final rizz: <b>${final.toLocaleString()}</b> · lines mogged: <b>${this.state.lines}</b><br>${tail}`,
        btnText: 'RUN IT BACK',
        showHandleInput: false,
      });
    });
  }

  // ---------- overlay / mute ----------

  private setupOverlay(): void {
    const o = getOverlay();
    o.handleInput.value = this.handle ?? '';
    o.btn.addEventListener('click', () => {
      if (this.dead || !this.running) this.startFromOverlay();
      else this.togglePause();
    });
    o.handleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!this.running) this.startFromOverlay();
      }
    });
  }

  private setupMuteButton(): void {
    const btn = document.getElementById('mute-btn');
    if (!(btn instanceof HTMLButtonElement)) return;
    const sync = () => {
      btn.textContent = this.sfx.isMuted ? '🔇' : '🔊';
      btn.classList.toggle('muted', this.sfx.isMuted);
    };
    if (loadMuted()) this.sfx.setMuted(true);
    sync();
    btn.addEventListener('click', () => {
      this.sfx.toggleMute();
      sync();
    });
    // expose for hotkey
    (this as unknown as { _syncMute: () => void })._syncMute = sync;
  }

  private toggleMute(): void {
    this.sfx.toggleMute();
    (this as unknown as { _syncMute?: () => void })._syncMute?.();
  }
}
