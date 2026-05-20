import type { InputBindings } from '../input.ts';

/**
 * Touch controls panel below the board. Visible only on coarse-pointer devices.
 * Buttons fire the same bindings as the keyboard; left/right/down support press-and-hold.
 */

const REPEAT_DELAY_MS = 130;
const REPEAT_RATE_MS = 40;
const SOFT_DROP_RATE_MS = 20;

export function mountTouchControls(bindings: InputBindings): HTMLElement {
  const root = document.createElement('div');
  root.className = 'touch-controls';
  root.innerHTML = `
    <div class="touch-row touch-top">
      <button class="touch-btn ccw" data-act="ccw" aria-label="rotate counter-clockwise">↺</button>
      <button class="touch-btn cw"  data-act="cw"  aria-label="rotate clockwise">↻</button>
      <button class="touch-btn hold" data-act="hold" aria-label="hold piece">HOLD</button>
    </div>
    <div class="touch-row touch-bottom">
      <button class="touch-btn left"  data-act="left"  aria-label="move left" data-hold="1">←</button>
      <button class="touch-btn soft"  data-act="soft"  aria-label="soft drop" data-hold="1">↓</button>
      <button class="touch-btn right" data-act="right" aria-label="move right" data-hold="1">→</button>
    </div>
    <button class="touch-btn drop" data-act="drop" aria-label="hard drop">SLAM</button>
  `;

  const dispatch = (act: string): void => {
    switch (act) {
      case 'left':  bindings.onMoveLeft(); break;
      case 'right': bindings.onMoveRight(); break;
      case 'soft':  bindings.onSoftDrop(); break;
      case 'drop':  bindings.onHardDrop(); break;
      case 'cw':    bindings.onRotateCW(); break;
      case 'ccw':   bindings.onRotateCCW(); break;
      case 'hold':  bindings.onHold(); break;
    }
  };

  const holdTimers = new Map<string, { das: number; iv: number | null }>();
  function stopHold(act: string): void {
    const t = holdTimers.get(act);
    if (!t) return;
    window.clearTimeout(t.das);
    if (t.iv != null) window.clearInterval(t.iv);
    holdTimers.delete(act);
  }
  function startHold(act: string): void {
    if (holdTimers.has(act)) return;
    dispatch(act); // immediate fire
    const rate = act === 'soft' ? SOFT_DROP_RATE_MS : REPEAT_RATE_MS;
    const das = window.setTimeout(() => {
      const iv = window.setInterval(() => dispatch(act), rate);
      const existing = holdTimers.get(act);
      if (existing) existing.iv = iv;
    }, REPEAT_DELAY_MS);
    holdTimers.set(act, { das, iv: null });
  }

  root.addEventListener('contextmenu', (e) => e.preventDefault());

  for (const btn of Array.from(root.querySelectorAll<HTMLButtonElement>('.touch-btn'))) {
    const act = btn.dataset.act!;
    const repeats = btn.dataset.hold === '1';

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('active');
      if (repeats) startHold(act);
      else dispatch(act);
    });

    const end = (e: PointerEvent): void => {
      btn.classList.remove('active');
      try { btn.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      if (repeats) stopHold(act);
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', (e) => { if (repeats) end(e); });
  }

  return root;
}
