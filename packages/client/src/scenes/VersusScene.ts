import Phaser from 'phaser';
import {
  COLS, ROWS, META, SHAPES,
  type ClientInput, type PlayerVersusState, type RoomStateSnapshot,
  type PieceType, type CellValue,
} from '@tetrizz/shared';
import { RoomClient } from '../net/room.ts';
import { bindInput, type InputBindings } from '../input.ts';
import { showOverlay, hideOverlay } from '../ui/overlay.ts';
import { setStatus } from '../ui/hud.ts';
import { Sfx } from '../audio/sfx.ts';
import { loadMuted } from '../persistence/store.ts';
import { fxTier } from '@tetrizz/shared';
import { mountTouchControls } from '../ui/touch.ts';

interface VersusData {
  roomClient: RoomClient;
  mySessionId: string;
  initialSnapshot: RoomStateSnapshot;
}

const MY_CELL = 28;
const OPP_CELL = 14;
const FRAME_PAD = 8;
const GUTTER = 22;
const MY_W = COLS * MY_CELL;       // 280
const MY_H = ROWS * MY_CELL;       // 560
const OPP_W = COLS * OPP_CELL;     // 140
const OPP_H = ROWS * OPP_CELL;     // 280
const MY_X = FRAME_PAD;
const MY_Y = FRAME_PAD;
const OPP_X = MY_X + MY_W + GUTTER;
const OPP_Y = MY_Y + Math.floor((MY_H - OPP_H) / 2);
const CANVAS_W = OPP_X + OPP_W + FRAME_PAD;     // 280 + 22 + 140 + 16 = ~474
const CANVAS_H = MY_H + FRAME_PAD * 2;          // 576

export class VersusScene extends Phaser.Scene {
  private roomClient!: RoomClient;
  private mySessionId = '';
  private snapshot!: RoomStateSnapshot;

  private gfx!: Phaser.GameObjects.Graphics;
  private hudEl: HTMLDivElement | null = null;

  private sfx!: Sfx;
  private prevTier: 0 | 1 | 2 | 3 = 0;
  private unbindInput?: () => void;
  private prevLockTicks = new Map<string, number>();

  constructor() {
    super('Versus');
  }

  init(data: VersusData): void {
    this.roomClient = data.roomClient;
    this.mySessionId = data.mySessionId;
    this.snapshot = data.initialSnapshot;
  }

  create(): void {
    this.scale.resize(CANVAS_W, CANVAS_H);
    document.body.classList.add('versus-stage');
    hideOverlay();

    this.cameras.main.setBackgroundColor('#07001a');
    this.gfx = this.add.graphics().setDepth(1);

    this.sfx = new Sfx(this.sound);
    if (loadMuted()) this.sfx.setMuted(true);

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
      onMuteToggle: () => this.sfx.toggleMute(),
      onStart: () => { /* nothing — versus is server-driven */ },
    };
    this.unbindInput = bindInput(bindings);

    const touchMount = document.getElementById('touch-controls-mount');
    if (touchMount) {
      touchMount.innerHTML = '';
      touchMount.appendChild(mountTouchControls(bindings));
    }

    this.renderAll();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private send(partial: Omit<ClientInput, 'tick'>): void {
    if (this.snapshot.phase !== 'playing') return;
    const me = this.findMe();
    if (!me || me.gameState.status !== 'playing') return;
    this.roomClient.sendInput({ ...partial, tick: this.snapshot.tick });
  }

  private onSnapshot(snap: RoomStateSnapshot): void {
    this.snapshot = snap;
    this.applyAudioFx(snap);
    this.renderAll();
    if (snap.phase === 'finished') this.showResult(snap);
  }

  private applyAudioFx(snap: RoomStateSnapshot): void {
    const me = snap.players.find((p) => p.sessionId === this.mySessionId);
    if (!me?.lastLockEvent) return;
    const prevTickKey = me.sessionId;
    if (this.prevLockTicks.get(prevTickKey) === snap.tick) return;
    this.prevLockTicks.set(prevTickKey, snap.tick);
    const ev = me.lastLockEvent;
    if (ev.linesCleared > 0) {
      const t = fxTier(ev.intensity);
      this.sfx.playClear(t);
      if (t > this.prevTier) this.prevTier = t;
    } else if (this.prevTier > 0) {
      this.sfx.playStreakLoss();
      this.prevTier = 0;
    }
  }

  private renderAll(): void {
    this.gfx.clear();
    const me = this.findMe();
    const opp = this.findOpp();
    this.drawFrame(MY_X, MY_Y, MY_W, MY_H, /*hot*/ true);
    this.drawFrame(OPP_X, OPP_Y, OPP_W, OPP_H, /*hot*/ false);
    this.drawBoard(MY_X, MY_Y, MY_CELL, me, /*ghost*/ true);
    this.drawBoard(OPP_X, OPP_Y, OPP_CELL, opp, /*ghost*/ false);
    this.updateHud();
  }

  /** Rounded panel frame around a board area — drawn inside the Phaser canvas
   *  so it scales with the renderer instead of relying on outer CSS chrome. */
  private drawFrame(x: number, y: number, w: number, h: number, hot: boolean): void {
    const radius = 10;
    // soft inner background tint
    this.gfx.fillStyle(0x07001a, 1);
    this.gfx.fillRoundedRect(x, y, w, h, radius);
    // halo: 3 progressively wider strokes for a faux glow
    const haloColor = hot ? 0xff2e93 : 0x29e4ff;
    for (let i = 3; i >= 1; i--) {
      this.gfx.lineStyle(i * 2, haloColor, 0.05 * i);
      this.gfx.strokeRoundedRect(x - i, y - i, w + i * 2, h + i * 2, radius + i);
    }
    // crisp 1px outline
    this.gfx.lineStyle(1.2, 0xffffff, 0.35);
    this.gfx.strokeRoundedRect(x, y, w, h, radius);
  }

  private drawBoard(
    ox: number,
    oy: number,
    cell: number,
    p: PlayerVersusState | undefined,
    drawGhost: boolean,
  ): void {
    // grid lines
    this.gfx.lineStyle(1, 0xffffff, 0.04);
    for (let c = 1; c < COLS; c++) {
      this.gfx.lineBetween(ox + c * cell, oy, ox + c * cell, oy + ROWS * cell);
    }
    for (let r = 1; r < ROWS; r++) {
      this.gfx.lineBetween(ox, oy + r * cell, ox + COLS * cell, oy + r * cell);
    }
    if (!p) return;
    const g = p.gameState;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = g.grid[r][c];
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

  private cell(
    ox: number, oy: number, col: number, row: number, cell: number,
    value: CellValue, ghost: boolean,
  ): void {
    if (value === 0) return;
    const color = Phaser.Display.Color.HexStringToColor(META[value as PieceType].color).color;
    const px = ox + col * cell;
    const py = oy + row * cell;
    if (ghost) {
      this.gfx.lineStyle(1.2, color, 0.55);
      this.gfx.strokeRoundedRect(px + 2, py + 2, cell - 4, cell - 4, 4);
      this.gfx.fillStyle(color, 0.13);
      this.gfx.fillRoundedRect(px + 2, py + 2, cell - 4, cell - 4, 4);
      return;
    }
    this.gfx.fillStyle(color, 1);
    this.gfx.fillRoundedRect(px + 1, py + 1, cell - 2, cell - 2, Math.max(2, cell / 6));
    this.gfx.fillStyle(0xffffff, 0.28);
    this.gfx.fillRoundedRect(px + 2, py + 2, cell - 4, Math.max(2, (cell - 4) / 2), Math.max(1, cell / 10));
    this.gfx.fillStyle(0x000000, 0.32);
    this.gfx.fillRect(px + cell - 4, py + 3, 2, cell - 6);
    this.gfx.fillRect(px + 3, py + cell - 4, cell - 6, 2);
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
  }

  private updateHud(): void {
    if (!this.hudEl) return;
    const me = this.findMe();
    const opp = this.findOpp();
    const meEl = this.hudEl.querySelector('.vs-me') as HTMLElement | null;
    const oppEl = this.hudEl.querySelector('.vs-opp') as HTMLElement | null;
    if (meEl && me) meEl.textContent = `${me.handle} · ${me.gameState.score.toLocaleString()}`;
    if (oppEl && opp) oppEl.textContent = `${opp.disconnected ? '(disconnected) ' : ''}${opp.handle} · ${opp.gameState.score.toLocaleString()}`;
    const meter = this.hudEl.querySelector('.vs-meter > i') as HTMLElement | null;
    if (meter && me) {
      const incoming = me.attackQueue.reduce((acc, e) => acc + e.lines, 0);
      const pct = Math.min(100, incoming * 12);
      meter.style.width = pct + '%';
    }
    setStatus(this.snapshot.phase === 'playing' ? 'cooking…' : this.snapshot.phase);
  }

  private findMe(): PlayerVersusState | undefined {
    return this.snapshot.players.find((p) => p.sessionId === this.mySessionId);
  }

  private findOpp(): PlayerVersusState | undefined {
    return this.snapshot.players.find((p) => p.sessionId !== this.mySessionId);
  }

  // ---------- end ----------

  private showResult(snap: RoomStateSnapshot): void {
    if (!snap.result) return;
    const me = this.findMe();
    const won = snap.result.winnerHandle && me && snap.result.winnerHandle === me.handle;
    const title = snap.result.reason === 'draw' ? "BOTH OF Y'ALL FELL OFF" : won ? 'YOU MOGGED THEM' : 'YOU GOT MOGGED';
    const sub = snap.result.players
      .map((p) => `<b>${escapeHtml(p.handle)}</b>: ${p.score.toLocaleString()} rizz · ${p.attackSent} sent · ${p.attackReceived} eaten`)
      .join('<br>');
    showOverlay({
      title,
      subHtml: sub + '<br><br>back to menu?',
      btnText: 'BACK TO MENU',
      showHandleInput: false,
    });
    const handler = () => {
      document.getElementById('ov-btn')?.removeEventListener('click', handler);
      this.scene.start('Menu');
    };
    document.getElementById('ov-btn')?.addEventListener('click', handler);
  }

  private onServerLeave(): void {
    if (this.snapshot.phase === 'finished') return;
    // Reaching this handler means the WS dropped mid-match. Most common causes:
    // mobile browser backgrounding the tab (screen lock, app switch) pauses JS
    // and the keep-alive ping lapses; or the network briefly dropped. The server
    // gives 30s to reconnect, but our client doesn't auto-reconnect yet — so
    // surface that to the player rather than pretending the server crashed.
    const phaseHint = this.snapshot.phase === 'playing'
      ? 'mid-match disconnect — likely the tab went to sleep or wifi blinked.'
      : 'connection dropped before the match started.';
    showOverlay({
      title: 'CONNECTION LOST',
      subHtml: `${phaseHint}<br>your opp gets the W by default.`,
      btnText: 'BACK TO MENU',
      showHandleInput: false,
    });
    const handler = () => {
      document.getElementById('ov-btn')?.removeEventListener('click', handler);
      this.scene.start('Menu');
    };
    document.getElementById('ov-btn')?.addEventListener('click', handler);
  }

  private teardown(): void {
    this.unbindInput?.();
    this.hudEl?.remove();
    this.hudEl = null;
    const touchMount = document.getElementById('touch-controls-mount');
    if (touchMount) touchMount.innerHTML = '';
    document.body.classList.remove('versus-stage');
    this.scale.resize(300, 600);
    this.roomClient.leave();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]!));
}
