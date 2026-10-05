import type { BoardResult, ParsedEvent } from '../model/types';

export interface PlayerEntry {
  name: string;
  eventId: string;
  eventName: string;
  teamNo: number;
  teamName: string;
  boards: number;
}

export interface Candidate {
  name: string;
  entries: PlayerEntry[];
  boards: number;
  /** 同一賽事出現在兩隊以上：可能是同名的不同人，需要選隊伍 */
  ambiguous: boolean;
  score: number;
}

/** 只從實際上場的配對名單建索引（不用「隊長」欄，避免代填人重複出現） */
export function buildIndex(events: ParsedEvent[], results: BoardResult[]): Map<string, PlayerEntry[]> {
  const teamName = new Map<string, string>();
  const eventName = new Map<string, string>();
  for (const e of events) {
    eventName.set(e.event.eventId, e.event.name);
    for (const t of e.teams) teamName.set(`${e.event.eventId}#${t.teamNo}`, t.name);
  }
  const counts = new Map<string, PlayerEntry>();
  const add = (name: string, eventId: string, teamNo: number) => {
    if (!name) return;
    const k = `${name}|${eventId}#${teamNo}`;
    let e = counts.get(k);
    if (!e) {
      e = { name, eventId, eventName: eventName.get(eventId) ?? eventId, teamNo, teamName: teamName.get(`${eventId}#${teamNo}`) ?? `#${teamNo}`, boards: 0 };
      counts.set(k, e);
    }
    e.boards++;
  };
  for (const r of results) {
    for (const n of r.nsPair) add(n, r.eventId, r.nsTeam);
    for (const n of r.ewPair) add(n, r.eventId, r.ewTeam);
  }
  const index = new Map<string, PlayerEntry[]>();
  for (const e of counts.values()) {
    const arr = index.get(e.name) ?? [];
    arr.push(e);
    index.set(e.name, arr);
  }
  return index;
}

/** 完全相符 → 前綴相符 → 字元重疊 */
export function matchScore(query: string, name: string): number {
  const q = query.replace(/\s+/g, '').toLowerCase();
  const n = name.replace(/\s+/g, '').toLowerCase();
  if (!q) return 0;
  if (q === n) return 3;
  if (n.startsWith(q)) return 2 + q.length / n.length / 10;
  if (n.includes(q)) return 1.5 + q.length / n.length / 10;
  const chars = [...new Set(q)];
  const hit = chars.filter((ch) => n.includes(ch)).length;
  const ratio = hit / chars.length;
  return ratio >= 0.5 ? ratio : 0;
}

export function search(index: Map<string, PlayerEntry[]>, query: string, limit = 12): Candidate[] {
  const out: Candidate[] = [];
  for (const [name, entries] of index) {
    const score = matchScore(query, name);
    if (score <= 0) continue;
    const perEvent = new Map<string, number>();
    for (const e of entries) perEvent.set(e.eventId, (perEvent.get(e.eventId) ?? 0) + 1);
    out.push({
      name,
      entries,
      boards: entries.reduce((s, e) => s + e.boards, 0),
      ambiguous: [...perEvent.values()].some((n) => n > 1),
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score || b.boards - a.boards || a.name.localeCompare(b.name)).slice(0, limit);
}
