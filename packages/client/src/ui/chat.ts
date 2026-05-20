import { CHAT_LINES, pickRandom } from './phrases.ts';

const MAX_MSGS = 8;

function chatEl(): HTMLElement {
  const el = document.getElementById('chat');
  if (!el) throw new Error('missing #chat');
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]!));
}

export function pushChat(): void {
  const line = pickRandom(CHAT_LINES);
  const colon = line.indexOf(':');
  const handle = colon === -1 ? line : line.slice(0, colon);
  const body = colon === -1 ? '' : line.slice(colon);
  const initials = handle.replace('@', '').charAt(0).toUpperCase() || '?';

  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML =
    `<div class="av">${escapeHtml(initials)}</div>` +
    `<div class="body"><b>${escapeHtml(handle)}</b>${escapeHtml(body)}</div>`;

  const container = chatEl();
  container.prepend(div);
  while (container.children.length > MAX_MSGS) {
    container.removeChild(container.lastChild!);
  }
}

export function seedChat(count = 3): void {
  for (let i = 0; i < count; i++) setTimeout(pushChat, 600 + i * 900);
}
