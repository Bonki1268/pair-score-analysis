import type { BoardResult, Side } from '../model/types';
import { sideOf } from '../model/types';

export type Role = 'declare' | 'defend' | 'pass' | 'adjusted';

/** 從某位賽員的角度看的一桌結果 */
export interface PlayerBoard {
  result: BoardResult;
  side: Side;
  partner: string;
  team: number;
  /** 賽員這一方的得分 */
  score: number;
  butler: number;
  role: Role;
}

export interface PlayerFilter {
  eventIds?: string[];
  /**
   * `${eventId}#${teamNo}`；同名不同人時用來區分。
   * 只限制清單裡出現的賽事，其他賽事的牌照常列入
   */
  teams?: string[];
  partner?: string;
}

export function teamRef(eventId: string, teamNo: number): string {
  return `${eventId}#${teamNo}`;
}

/** teamRef 的賽事部分；賽事 ID 本身可能含有 # */
export function teamEvent(ref: string): string {
  return ref.slice(0, ref.lastIndexOf('#'));
}

export function toPlayerBoard(r: BoardResult, side: Side, name: string): PlayerBoard {
  const pair = side === 'NS' ? r.nsPair : r.ewPair;
  const partner = pair[0] === name ? pair[1] : pair[0];
  let role: Role;
  if (r.contract.adjusted) role = 'adjusted';
  else if (r.contract.level === 0 || !r.contract.declarer) role = 'pass';
  else role = sideOf(r.contract.declarer) === side ? 'declare' : 'defend';
  return {
    result: r,
    side,
    partner,
    team: side === 'NS' ? r.nsTeam : r.ewTeam,
    score: side === 'NS' ? r.nsScore : -r.nsScore,
    butler: side === 'NS' ? r.nsButler : r.ewButler,
    role,
  };
}

export function playerBoards(results: BoardResult[], name: string, filter: PlayerFilter = {}): PlayerBoard[] {
  const out: PlayerBoard[] = [];
  const events = filter.eventIds ? new Set(filter.eventIds) : null;
  const teams = filter.teams && filter.teams.length > 0 ? new Set(filter.teams) : null;
  const teamEvents = new Set([...(teams ?? [])].map(teamEvent));
  for (const r of results) {
    if (events && !events.has(r.eventId)) continue;
    let side: Side | null = null;
    if (r.nsPair.includes(name)) side = 'NS';
    else if (r.ewPair.includes(name)) side = 'EW';
    if (!side) continue;
    const pb = toPlayerBoard(r, side, name);
    if (teams && teamEvents.has(r.eventId) && !teams.has(teamRef(r.eventId, pb.team))) continue;
    if (filter.partner && pb.partner !== filter.partner) continue;
    out.push(pb);
  }
  return out.sort(
    (a, b) =>
      a.result.eventId.localeCompare(b.result.eventId) || a.result.round - b.result.round || a.result.board - b.result.board,
  );
}

export function sum(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

export function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}
