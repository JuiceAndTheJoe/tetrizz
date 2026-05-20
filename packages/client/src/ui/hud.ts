import { META, type PieceType } from '@tetrizz/shared';
import { LINES_PER_LEVEL } from '@tetrizz/shared';

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const els = {
  score: () => $('score'),
  lines: () => $('lines'),
  level: () => $('level'),
  combo: () => $('combo'),
  best: () => $('best'),
  handle: () => $('handle'),
  status: () => $('status'),
  lvlBar: () => $('lvlbar'),
  lvlNxt: () => $('lvlnext'),
  holdBoard: () => $('hold-board'),
  nextBoard: () => $('next-board'),
};

export interface ScoreboardState {
  score: number;
  lines: number;
  level: number;
  combo: number;
  best: number;
}

export function setScoreboard(s: ScoreboardState): void {
  els.score().textContent = s.score.toLocaleString();
  els.lines().textContent = String(s.lines);
  els.level().textContent = String(s.level);
  els.combo().textContent = (s.combo >= 0 ? s.combo + 1 : 0) + '×';
  els.best().textContent = s.best.toLocaleString();
  const inLvl = s.lines % LINES_PER_LEVEL;
  els.lvlBar().style.width = (inLvl * (100 / LINES_PER_LEVEL)) + '%';
  els.lvlNxt().textContent = `${inLvl} / ${LINES_PER_LEVEL}`;
}

export function setHandle(handle: string | null): void {
  els.handle().textContent = handle ?? '—';
}

export function setStatus(text: string): void {
  els.status().textContent = text;
}

export function setHold(type: PieceType | null): void {
  const root = els.holdBoard();
  root.innerHTML = '';
  if (!type) {
    root.appendChild(placeholderSpan());
    return;
  }
  root.appendChild(buildMiniPiece(type));
}

export function setNext(queue: readonly PieceType[]): void {
  const root = els.nextBoard();
  root.innerHTML = '';
  const type = queue[0] ?? null;
  if (type) root.appendChild(buildMiniPiece(type));
  else root.appendChild(placeholderSpan());
}

function placeholderSpan(): HTMLElement {
  const s = document.createElement('span');
  s.style.color = 'rgba(255,255,255,.3)';
  s.style.fontSize = '11px';
  s.style.letterSpacing = '.18em';
  s.textContent = '—';
  return s;
}

// builds a tiny CSS-only render of the piece using the rotation-0 shape
function buildMiniPiece(type: PieceType): HTMLElement {
  const meta = META[type];
  const shape = ROT0_SHAPES[type];
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    display: grid;
    gap: 2px;
    grid-template-columns: repeat(${shape[0].length}, 14px);
    grid-template-rows: repeat(${shape.length}, 14px);
  `;
  for (const row of shape) {
    for (const cell of row) {
      const c = document.createElement('div');
      if (cell) {
        c.style.cssText = `
          background: ${meta.color};
          border-radius: 3px;
          box-shadow: 0 0 8px ${meta.glow}, inset 0 1px 0 rgba(255,255,255,.4);
        `;
      } else {
        c.style.visibility = 'hidden';
      }
      wrap.appendChild(c);
    }
  }
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:6px;';
  wrapper.appendChild(wrap);
  const label = document.createElement('div');
  label.textContent = meta.name;
  label.style.cssText = 'font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: .12em; color: rgba(255,255,255,.5);';
  wrapper.appendChild(label);
  return wrapper;
}

// Rotation-0 shapes trimmed of empty rows so the mini renders compactly.
// Hardcoded so we don't pull in the full SHAPES table for one tiny widget.
const ROT0_SHAPES: Readonly<Record<PieceType, readonly (readonly number[])[]>> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[1, 1, 1], [0, 1, 0]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};
