import './styles.css';
import type { ParsedEvent } from './model/types';
import { placeEvent } from './model/event-id';
import { deleteEvent, loadEvents, saveEvent } from './model/store';
import { buildIndex, type PlayerEntry } from './index/players';
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
  errors: [] as string[],
  notices: [] as string[],
  ds: buildDataset([]),
  index: new Map<string, PlayerEntry[]>(),
  loading: false,
};

function rebuild() {
  const events = state.events
    .slice()
    .sort((a, b) => a.event.name.localeCompare(b.event.name));
  state.ds = buildDataset(events);
  state.index = buildIndex(events, state.ds.results);
}

async function addFiles(files: File[]) {
  state.errors = [];
  state.notices = [];
  state.loading = true;
  render();
  for (const f of files) {
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      if (!isZip(data)) await loadCodepages();
      const placed = placeEvent(state.events, parseWorkbook(data, f.name));
      state.events = state.events.filter((e) => e.event.eventId !== placed.replaces).concat(placed.event);
      if (placed.note) state.notices.push(placed.note);
      await saveEvent(placed.event);
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

function renderHome() {
  app.replaceChildren(
    h(`<header class="site-head"><h1>輸在哪</h1><p class="muted">上傳隊制賽或雙人賽成績表，查看個人在叫牌、競叫、做莊、防守的得失分。</p></header>`),
    renderUpload(state.events, state.errors, { onFiles: addFiles, onDelete: removeEvent }, state.notices),
  );
  if (state.loading) app.append(h('<p class="muted center">解析中…</p>'));
  if (state.events.length > 0) {
    app.append(renderSearch(state.index));
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
  document.title = `${params.name} · 輸在哪`;
  app.replaceChildren(renderReport(ds, rep, params, entries));
  window.scrollTo(0, 0);
}

function render() {
  const route = parseRoute();
  if (route) renderPlayer(state.ds, route);
  else {
    document.title = '輸在哪';
    renderHome();
  }
}

async function init() {
  app.innerHTML = '<p class="muted center">載入中…</p>';
  try {
    state.events = await loadEvents();
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
