// mulberry32: small, fast, well-distributed 32-bit PRNG.
// Used in place of Math.random so bag shuffles are deterministic and replayable.
export function nextRandom(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, (state + 1) | 0];
}

/** Inclusive-exclusive integer in [0, n). Returns the picked int + advanced state. */
export function nextInt(state: number, n: number): [pick: number, next: number] {
  const [v, s] = nextRandom(state);
  return [Math.floor(v * n), s];
}
