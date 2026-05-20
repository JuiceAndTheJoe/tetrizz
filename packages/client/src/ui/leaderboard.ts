// Thin client for /api/leaderboard + /api/scores. Both calls fail open —
// the game keeps working even if the backend is unreachable.

interface LeaderboardRow {
  handle: string;
  score: number;
  lines: number;
  level: number;
  created_at: string;
}

const LIST_LIMIT = 10;

function panelEl(): HTMLElement | null {
  return document.getElementById('leaderboard-list');
}

export async function fetchLeaderboard(): Promise<void> {
  const root = panelEl();
  if (!root) return;
  try {
    const res = await fetch(`/api/leaderboard?limit=${LIST_LIMIT}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const rows: LeaderboardRow[] = await res.json();
    renderRows(root, rows);
  } catch (err) {
    console.warn('[leaderboard] fetch failed', err);
    renderError(root);
  }
}

export async function submitScore(payload: {
  handle: string;
  score: number;
  lines: number;
  level: number;
}): Promise<void> {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    // refresh the board to surface the new entry immediately
    void fetchLeaderboard();
  } catch (err) {
    console.warn('[leaderboard] submit failed', err);
  }
}

function renderRows(root: HTMLElement, rows: LeaderboardRow[]): void {
  if (rows.length === 0) {
    root.innerHTML = `<div class="lb-empty">no scores yet · be the first to cook</div>`;
    return;
  }
  const html = rows.map((row, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    return (
      `<div class="lb-row ${rankClass}">` +
        `<span class="lb-rank">${rank}</span>` +
        `<span class="lb-handle" title="${escapeHtml(row.handle)}">${escapeHtml(row.handle)}</span>` +
        `<span class="lb-score">${row.score.toLocaleString()}</span>` +
      `</div>`
    );
  }).join('');
  root.innerHTML = html;
}

function renderError(root: HTMLElement): void {
  root.innerHTML = `<div class="lb-empty">leaderboard offline · check back later</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]!));
}
