// Versus game-over takeover: mogface.png fades in over the whole screen, then
// flashes like TV static before settling into a faint backdrop behind the result
// card. Pure DOM/CSS so it layers over the Phaser canvas and the result overlay.

const MOG_SRC = 'img/mogface.png';

// Warm the browser cache so the fade-in isn't waiting on the first byte.
const preload = new Image();
preload.src = MOG_SRC;

let el: HTMLDivElement | null = null;
const timers: number[] = [];

function clearTimers(): void {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
}

export function showMogTakeover(): void {
  hideMogTakeover();
  el = document.createElement('div');
  el.className = 'mog-takeover';
  el.innerHTML = `<div class="mog-static"></div><img src="${MOG_SRC}" alt="mogged" draggable="false" />`;
  document.body.appendChild(el);
  // force a reflow so the opacity transition actually animates from 0
  void el.offsetWidth;
  el.classList.add('in');
  // fade-in (~0.8s) → static flash (~1.2s) → settle into a dim backdrop
  timers.push(window.setTimeout(() => el?.classList.add('flashing'), 850));
  timers.push(window.setTimeout(() => {
    el?.classList.remove('flashing');
    el?.classList.add('settled');
  }, 850 + 1200));
}

export function hideMogTakeover(): void {
  clearTimers();
  el?.remove();
  el = null;
}
