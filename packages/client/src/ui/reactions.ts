export type ReactionKind = 'hot' | 'cyan' | 'lime' | 'yel' | 'fire' | '';
export type ReactionSize = 'small' | 'big' | 'huge' | '';

const REACTION_LIFETIME_MS = 2700;

// Pre-defined slot positions (% of the reactions container) spaced so even
// 'big'/'huge' reactions don't visually overlap. Each new flash picks the
// least-recently-used slot, so rapid bursts (line clear + tier-up + high-score)
// fan out instead of stacking on top of each other.
const SLOT_TOPS  = [30, 46, 62, 36, 52, 68];
const SLOT_LEFTS = [38, 60, 42, 62, 36, 56];
const slotLastUsed: number[] = SLOT_TOPS.map(() => 0);

function reactionsEl(): HTMLElement {
  const el = document.getElementById('reactions');
  if (!el) throw new Error('missing #reactions');
  return el;
}

function pickSlot(): number {
  let slot = 0;
  let oldest = slotLastUsed[0];
  for (let i = 1; i < slotLastUsed.length; i++) {
    if (slotLastUsed[i] < oldest) { slot = i; oldest = slotLastUsed[i]; }
  }
  slotLastUsed[slot] = performance.now();
  return slot;
}

export function flash(
  text: string,
  kind: ReactionKind = 'hot',
  rotateDeg = -6,
  size: ReactionSize = '',
): void {
  const el = document.createElement('div');
  const classes = ['reaction'];
  if (kind) classes.push(kind);
  if (size) classes.push(size);
  el.className = classes.join(' ');
  el.style.setProperty('--r', rotateDeg + 'deg');
  const slot = pickSlot();
  // tiny jitter keeps the placement feeling organic without breaking the spacing
  el.style.left = (SLOT_LEFTS[slot] + (Math.random() - 0.5) * 4) + '%';
  el.style.top  = (SLOT_TOPS [slot] + (Math.random() - 0.5) * 3) + '%';
  el.textContent = text;
  reactionsEl().appendChild(el);
  setTimeout(() => el.remove(), REACTION_LIFETIME_MS);
}
