export type ReactionKind = 'hot' | 'cyan' | 'lime' | 'yel' | 'fire' | '';
export type ReactionSize = 'small' | 'big' | 'huge' | '';

const REACTION_LIFETIME_MS = 2700;

function reactionsEl(): HTMLElement {
  const el = document.getElementById('reactions');
  if (!el) throw new Error('missing #reactions');
  return el;
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
  el.style.left = (28 + Math.random() * 44) + '%';
  el.style.top = (40 + Math.random() * 30) + '%';
  el.textContent = text;
  reactionsEl().appendChild(el);
  setTimeout(() => el.remove(), REACTION_LIFETIME_MS);
}
