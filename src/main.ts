import './styles.css';
import type { ParsedEvent } from './model/types';
import { deleteEvent, loadAliases, loadEvents, saveAliases, saveEvent } from './model/store';
import { applyAliases, buildIndex, type AliasMap, type PlayerEntry } from './index/players';
import { buildDataset, buildReport, type Dataset } from './engine/report';
import { parseWorkbook, ParseError } from './parsers/detect';
import { isZip, loadCodepages } from './parsers/grid';
import { esc, h } from './ui/format';
import { renderReport, type ReportParams } from './ui/report';
import { renderSearch } from './ui/search';
import { renderUpload } from './ui/upload';

const app = document.getElementById('app')!;

const state = {
  events: [] as ParsedEvent[],
  aliases: {} as AliasMap,
  errors: [] as string[],
  ds: buildDataset([]),
  index: new Map<string, PlayerEntry[]>(),
  loading: false,
};

function rebuild() {
  const events = state.events
    .slice()
    .sort((a, b) => a.event.name.localeCompare(b.event.name))
    .map((e) => ({ ...e, results: applyAliases(e.results, state.aliases) }));
  state.ds = buildDataset(events);
  state.index = buildIndex(events, state.ds.results);
}

async function addFiles(files: File[]) {
  state.errors = [];
  state.loading = true;
  render();
  for (const f of files) {
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      if (!isZip(data)) await loadCodepages();
      const parsed = parseWorkbook(data, f.name);
      state.events = state.events.filter((e) => e.event.eventId !== parsed.event.eventId).concat(parsed);
      await saveEvent(parsed);
    } catch (err) {
      state.errors.push(err instanceof ParseError ? err.message : `「${f.name}」解析失敗：${(err as Error).message}`);
      console.error(err);
    }
  }
  state.loading = false;
  rebuild();
  render();
}

async function removeEvent(eventId: string) {
  state.events = state.events.filter((e) => e.event.eventId !== eventId);
  await deleteEvent(eventId);
  rebuild();
  render();
}

function aliasPanel(): HTMLElement {
  const text = Object.entries(state.aliases)
    .map(([a, b]) => `${a} = ${b}`)
    .join('\n');
  const el = h(`
    <section class="card">
      <details>
        <summary><h2 class="inline">別名設定</h2></summary>
        <p class="muted small">簡繁體、異體字或不同賽事寫法不同時，指定為同一人。每行一組：<code>別名 = 正式名字</code></p>
        <textarea rows="4" placeholder="王小名 = 王小明">${esc(text)}</textarea>
        <button class="primary">儲存別名</button>
      </details>
    </section>`);
  el.querySelector('button')!.addEventListener('click', async () => {
    const map: AliasMap = {};
    for (const line of el.querySelector('textarea')!.value.split('\n')) {
      const [a, b] = line.split('=').map((s) => s.trim());
      if (a && b && a !== b) map[a] = b;
    }
    state.aliases = map;
    await saveAliases(map);
    rebuild();
    render();
  });
  return el;
}

function renderHome() {
  app.replaceChildren(
    h(`<header class="site-head"><h1>橋牌成績分析</h1><p class="muted">上傳隊制賽成績表，查看個人在叫牌、競叫、做莊、防守的得失分。</p></header>`),
    renderUpload(state.events, state.errors, { onFiles: addFiles, onDelete: removeEvent }),
  );
  if (state.loading) app.append(h('<p class="muted center">解析中…</p>'));
  if (state.events.length > 0) {
    app.append(renderSearch(state.index), aliasPanel());
  }
}

function parseRoute(): ReportParams | null {
  const m = /^#\/p\/([^?]+)(?:\?(.*))?$/.exec(location.hash);
  if (!m) return null;
  const q = new URLSearchParams(m[2] ?? '');
  return {
    name: decodeURIComponent(m[1]),
    event: q.get('e') ?? undefined,
    team: q.get('t') ?? undefined,
    partner: q.get('partner') ?? undefined,
  };
}

function renderPlayer(ds: Dataset, params: ReportParams) {
  const entries = state.index.get(params.name);
  if (!entries) {
    app.replaceChildren(
      h(`<section class="card"><a class="back" href="#/">← 回到搜尋</a>
        <p>${state.events.length === 0 ? '尚未匯入成績表。報告只能在已上傳成績表的瀏覽器裡開啟，請先上傳檔案。' : `找不到賽員「${esc(params.name)}」。`}</p></section>`),
    );
    return;
  }
  const rep = buildReport(ds, params.name, {
    eventIds: params.event ? [params.event] : undefined,
    teams: params.team ? [params.team] : undefined,
    partner: params.partner,
  });
  document.title = `${params.name} · 橋牌成績分析`;
  app.replaceChildren(renderReport(ds, rep, params, entries));
  window.scrollTo(0, 0);
}

function render() {
  const route = parseRoute();
  if (route) renderPlayer(state.ds, route);
  else {
    document.title = '橋牌成績分析';
    renderHome();
  }
}

async function init() {
  app.innerHTML = '<p class="muted center">載入中…</p>';
  try {
    [state.events, state.aliases] = await Promise.all([loadEvents(), loadAliases()]);
    // 早期版本存下的賽事沒有類型欄位，當時只支援隊制賽
    for (const e of state.events) {
      e.event.kind ??= 'teams';
      e.event.scoring ??= 'imp-teams';
    }
  } catch (err) {
    console.error(err);
  }
  rebuild();
  render();
  window.addEventListener('hashchange', render);
}

init();
