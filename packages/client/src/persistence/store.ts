// localStorage keys are namespaced so other apps on the same origin don't collide.
const BEST_KEY = 'tetrizz.best';
const HANDLE_KEY = 'tetrizz.handle';
const MUTED_KEY = 'tetrizz.muted';

export function loadBest(): number {
  return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
}
export function saveBest(score: number): void {
  localStorage.setItem(BEST_KEY, String(score));
}

export function loadHandle(): string | null {
  return localStorage.getItem(HANDLE_KEY);
}
export function saveHandle(handle: string): void {
  localStorage.setItem(HANDLE_KEY, handle);
}

export function loadMuted(): boolean {
  return localStorage.getItem(MUTED_KEY) === '1';
}
export function saveMuted(muted: boolean): void {
  localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
}

/** Normalize a user-typed handle so it doesn't break the UI. Empty → null. */
export function normalizeHandle(raw: string): string | null {
  const trimmed = raw.trim().replace(/^@+/, '').slice(0, 14);
  if (!trimmed) return null;
  return '@' + trimmed;
}
