import type { ParsedEvent } from './types';

// 賽事 ID 取自成績表標題；每週例行賽之類的標題可能相同，需要分開保存

/** 成績表標題；分開保存過的賽事名稱會加上檔名，標題另存在 title */
export function titleOf(p: ParsedEvent): string {
  return p.event.title ?? p.event.name;
}

/** 牌局結果的指紋：內容完全相同的成績表視為同一份 */
function fingerprint(p: ParsedEvent): string {
  return p.results
    .map((r) => `${r.round}|${r.table}|${r.room}|${r.board}|${r.contract.raw}|${r.nsScore}`)
    .sort()
    .join(';');
}

/** 把賽事 ID 與名稱換掉，連同各筆資料裡的 eventId 與 matchId */
export function renameEvent(p: ParsedEvent, eventId: string, name: string): ParsedEvent {
  const old = p.event.eventId;
  if (eventId === old && name === p.event.name) return p;
  const matchId = (id: string) => (id.startsWith(old) ? eventId + id.slice(old.length) : id);
  return {
    ...p,
    event: { ...p.event, eventId, name, title: titleOf(p) },
    teams: p.teams.map((t) => ({ ...t, eventId })),
    matches: p.matches.map((m) => ({ ...m, eventId, matchId: matchId(m.matchId) })),
    results: p.results.map((r) => ({ ...r, eventId, matchId: matchId(r.matchId) })),
    deals: p.deals.map((d) => ({ ...d, eventId })),
  };
}

export interface Placement {
  event: ParsedEvent;
  /** 要被取代的既有賽事 ID */
  replaces: string | null;
  /** 和既有賽事同標題、已分開保存時給使用者的說明 */
  note: string | null;
}

/**
 * 決定新上傳的成績表要取代哪一份既有賽事，或分開保存：
 * - 同標題且同檔名，或牌局結果完全相同 → 視為重新上傳，取代該份
 * - 同標題但不是同一份 → 賽事 ID 與名稱加上檔名，分開保存
 */
export function placeEvent(existing: ParsedEvent[], parsed: ParsedEvent): Placement {
  const title = titleOf(parsed);
  const same = existing.filter((e) => titleOf(e) === title);
  if (same.length === 0) return { event: parsed, replaces: null, note: null };

  const fp = fingerprint(parsed);
  const match = same.find((e) => e.event.fileName === parsed.event.fileName) ?? same.find((e) => fingerprint(e) === fp);
  if (match) return { event: renameEvent(parsed, match.event.eventId, match.event.name), replaces: match.event.eventId, note: null };

  const base = `${title}（${parsed.event.fileName.replace(/\.xlsx?$/i, '')}）`;
  const ids = new Set(existing.map((e) => e.event.eventId));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base} ${n}`;
  return {
    event: renameEvent(parsed, id, id),
    replaces: null,
    note: `「${parsed.event.fileName}」和已匯入的「${same[0].event.fileName}」標題相同，已分開保存為「${id}」。若是同一場比賽的更正版，請移除舊的那份。`,
  };
}
