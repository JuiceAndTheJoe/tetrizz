// Keyboard input with DAS (delay before auto-repeat) and ARR (auto-repeat rate).
// Lives outside Phaser so menu/pause keys work even before the scene exists.

export interface InputBindings {
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onSoftDrop: () => void;
  onHardDrop: () => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  onHold: () => void;
  onPauseToggle: () => void;
  onReset: () => void;
  onMuteToggle: () => void;
  onStart: () => void;
}

const DAS_MS = 130;
const ARR_MS = 40;
const SOFT_DROP_RATE_MS = 20;

type RepeatKind = 'das' | 'iv';

interface RepeatHandle {
  kind: RepeatKind;
  handle: number;
}

export function bindInput(bindings: InputBindings): () => void {
  const repeats = new Map<string, RepeatHandle>();

  function startRepeat(id: string, fn: () => void, rate: number): void {
    if (repeats.has(id)) return;
    const dasTimer = window.setTimeout(() => {
      const iv = window.setInterval(fn, rate);
      repeats.set(id, { kind: 'iv', handle: iv });
    }, DAS_MS);
    repeats.set(id, { kind: 'das', handle: dasTimer });
  }
  function stopRepeat(id: string): void {
    const r = repeats.get(id);
    if (!r) return;
    if (r.kind === 'das') window.clearTimeout(r.handle);
    else window.clearInterval(r.handle);
    repeats.delete(id);
  }
  function stopAll(): void {
    for (const id of repeats.keys()) stopRepeat(id);
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isTypingTarget(e.target)) return;
    if (e.repeat) return; // we manage our own repeat timing
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Shift'].includes(k)) {
      e.preventDefault();
    }
    if (k === 'ArrowLeft') {
      bindings.onMoveLeft();
      startRepeat('L', bindings.onMoveLeft, ARR_MS);
    } else if (k === 'ArrowRight') {
      bindings.onMoveRight();
      startRepeat('R', bindings.onMoveRight, ARR_MS);
    } else if (k === 'ArrowDown') {
      bindings.onSoftDrop();
      startRepeat('D', bindings.onSoftDrop, SOFT_DROP_RATE_MS);
    } else if (k === ' ') {
      bindings.onHardDrop();
    } else if (k === 'ArrowUp' || k === 'x' || k === 'X') {
      bindings.onRotateCW();
    } else if (k === 'z' || k === 'Z') {
      bindings.onRotateCCW();
    } else if (k === 'Shift' || k === 'c' || k === 'C') {
      bindings.onHold();
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      bindings.onPauseToggle();
    } else if (k === 'r' || k === 'R') {
      bindings.onReset();
    } else if (k === 'm' || k === 'M') {
      bindings.onMuteToggle();
    } else if (k === 'Enter') {
      bindings.onStart();
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    const k = e.key;
    if (k === 'ArrowLeft') stopRepeat('L');
    else if (k === 'ArrowRight') stopRepeat('R');
    else if (k === 'ArrowDown') stopRepeat('D');
  }

  function onBlur(): void { stopAll(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    stopAll();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
