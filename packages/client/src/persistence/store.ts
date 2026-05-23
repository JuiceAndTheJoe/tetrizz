// localStorage keys are namespaced so other apps on the same origin don't collide.
const BEST_KEY = 'tetrizz.best';
const HANDLE_KEY = 'tetrizz.handle';
const MUTED_KEY = 'tetrizz.muted';
const SFX_VOL_KEY = 'tetrizz.sfxVol';
const MUSIC_VOL_KEY = 'tetrizz.musicVol';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

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

/** SFX volume 0..1 (multiplies each effect's base volume). Default full. */
export function loadSfxVolume(): number {
  const v = parseFloat(localStorage.getItem(SFX_VOL_KEY) ?? '');
  return Number.isFinite(v) ? clamp01(v) : 1;
}
export function saveSfxVolume(v: number): void {
  localStorage.setItem(SFX_VOL_KEY, String(clamp01(v)));
}

/** Background-music volume 0..1 (slider position). The actual gain is capped at
 *  50% in Sfx, so 1.0 here = half master. Default 0.5 → quarter master. */
export function loadMusicVolume(): number {
  const v = parseFloat(localStorage.getItem(MUSIC_VOL_KEY) ?? '');
  return Number.isFinite(v) ? clamp01(v) : 0.5;
}
export function saveMusicVolume(v: number): void {
  localStorage.setItem(MUSIC_VOL_KEY, String(clamp01(v)));
}

/** Normalize a user-typed handle so it doesn't break the UI. Empty → null. */
export function normalizeHandle(raw: string): string | null {
  const trimmed = raw.trim().replace(/^@+/, '').slice(0, 14);
  if (!trimmed) return null;
  return '@' + trimmed;
}
