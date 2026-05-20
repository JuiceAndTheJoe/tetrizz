// The bg-glow lives in DOM (full-viewport) since it can't easily mix-blend over external HTML.
// JS just toggles the body class; CSS does the rest with @property color transitions.

export function setBgTier(tier: 0 | 1 | 2 | 3): void {
  const cls = document.body.classList;
  cls.remove('fx-1', 'fx-2', 'fx-3');
  if (tier > 0) cls.add('fx-' + tier);
}
