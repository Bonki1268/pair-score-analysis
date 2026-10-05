import { search, type Candidate, type PlayerEntry } from '../index/players';
import { esc, h } from './format';

export function reportHref(name: string, opts: { team?: string; event?: string; partner?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.event) q.set('e', opts.event);
  if (opts.team) q.set('t', opts.team);
  if (opts.partner) q.set('partner', opts.partner);
  const qs = q.toString();
  return `#/p/${encodeURIComponent(name)}${qs ? `?${qs}` : ''}`;
}

export function renderSearch(index: Map<string, PlayerEntry[]>, initial = ''): HTMLElement {
  const el = h(`
    <section class="card">
      <h2>2. 搜尋賽員</h2>
      <input class="search" type="search" placeholder="輸入名字，例如：王小" autocomplete="off" aria-label="賽員名字">
      <ul class="candidates" aria-live="polite"></ul>
    </section>`);
  const input = el.querySelector('input')!;
  const list = el.querySelector('ul')!;
  const update = () => {
    const q = input.value.trim();
    if (!q) {
      list.innerHTML = `<li class="muted small">共 ${index.size} 位賽員</li>`;
      return;
    }
    const found = search(index, q);
    list.innerHTML = found.length ? found.flatMap(candidateRows).join('') : '<li class="muted">找不到符合的賽員</li>';
  };
  input.value = initial;
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = list.querySelector('a');
      if (first) location.hash = first.getAttribute('href')!;
    }
  });
  update();
  queueMicrotask(() => input.focus());
  return el;
}

/** 同一賽事出現在兩隊時，每隊各列一行讓使用者選；否則一個名字一行 */
function candidateRows(c: Candidate): string[] {
  if (!c.ambiguous) {
    const teams = [...new Set(c.entries.map((e) => e.teamName))].join('、');
    return [row(c.name, reportHref(c.name), teams, c.boards)];
  }
  return c.entries.map((e) => row(c.name, reportHref(c.name, { team: `${e.eventId}#${e.teamNo}`, event: e.eventId }), `${e.teamName} · ${e.eventName}`, e.boards));
}

function row(name: string, href: string, teams: string, boards: number): string {
  return `<li><a class="candidate" href="${esc(href)}"><strong>${esc(name)}</strong><span class="muted">${esc(teams)}</span><span class="muted small">${boards} 副</span></a></li>`;
}
