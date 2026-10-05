import type { BoardResult, Deal, Event, ParsedEvent, Side } from '../model/types';
import thresholds from '../config/thresholds.json';
import { boardKey, groupByBoard } from './butler';
import { categoryStats, classifyAll, type CategoryStat, type Classified } from './classify';
import { generateInsights, type Insight } from './insights';
import { mean, playerBoards, sum, type PlayerBoard, type PlayerFilter } from './player-boards';
import { trickStats, type TrickStat } from './trick-diff';

export interface GroupStat {
  key: string;
  label: string;
  boards: number;
  imp: number;
  perBoard: number;
  declare: number | null;
  defend: number | null;
}

export interface RoundStat {
  eventId: string;
  eventName: string;
  round: number;
  opponent: string;
  side: string;
  boards: number;
  imp: number;
}

export interface ReviewItem {
  item: Classified;
  deal: Deal | null;
  /** 全場同一副牌的結果，依南北得分由高到低 */
  field: BoardResult[];
}

export interface PlayerReport {
  name: string;
  boards: number;
  butler: number;
  perBoard: number;
  rank: { position: number; of: number; percentile: number } | null;
  categories: CategoryStat[];
  declare: TrickStat;
  defend: TrickStat;
  partners: GroupStat[];
  seats: GroupStat[];
  rounds: RoundStat[];
  overbidCount: number;
  /** 雙人賽成績表原本的分數加總（Cross-IMP 或 Butler）；混合不同計分方式時為 null */
  sheetScore: { label: string; imp: number } | null;
  insights: Insight[];
  headline: string;
  lowSample: boolean;
  review: { worst: ReviewItem[]; best: ReviewItem[] };
  classified: Classified[];
}

export interface Dataset {
  events: ParsedEvent[];
  results: BoardResult[];
  byBoard: Map<string, BoardResult[]>;
  deals: Map<string, Deal>;
  teamNames: Map<string, string>;
  eventNames: Map<string, string>;
  eventInfo: Map<string, Event>;
}

export function buildDataset(events: ParsedEvent[]): Dataset {
  const results = events.flatMap((e) => e.results);
  const deals = new Map<string, Deal>();
  for (const e of events) for (const d of e.deals) deals.set(boardKey(d), d);
  const teamNames = new Map<string, string>();
  for (const e of events) for (const t of e.teams) teamNames.set(`${e.event.eventId}#${t.teamNo}`, t.name);
  return {
    events,
    results,
    byBoard: groupByBoard(results),
    deals,
    teamNames,
    eventNames: new Map(events.map((e) => [e.event.eventId, e.event.name])),
    eventInfo: new Map(events.map((e) => [e.event.eventId, e.event])),
  };
}

function groupStats(items: Classified[], keyOf: (pb: PlayerBoard) => string, labelOf: (k: string) => string, trick: { declare: TrickStat; defend: TrickStat }): GroupStat[] {
  const groups = new Map<string, Classified[]>();
  for (const i of items) {
    const k = keyOf(i.pb);
    const arr = groups.get(k) ?? [];
    arr.push(i);
    groups.set(k, arr);
  }
  const trickMean = (stat: TrickStat, k: string) => {
    const xs = stat.items.filter((x) => keyOf(x.pb) === k);
    return xs.length ? mean(xs.map((x) => x.diff)) : null;
  };
  return [...groups.entries()]
    .map(([k, xs]) => {
      const imp = sum(xs.map((x) => x.pb.butler));
      return { key: k, label: labelOf(k), boards: xs.length, imp, perBoard: imp / xs.length, declare: trickMean(trick.declare, k), defend: trickMean(trick.defend, k) };
    })
    .sort((a, b) => b.boards - a.boards || a.label.localeCompare(b.label));
}

/** 所選賽事中每位賽員的每牌 Butler，用來算排名百分位 */
export function playerAverages(ds: Dataset, eventIds?: string[]): Map<string, { boards: number; imp: number }> {
  const events = eventIds ? new Set(eventIds) : null;
  const map = new Map<string, { boards: number; imp: number }>();
  const add = (name: string, imp: number) => {
    if (!name) return;
    const e = map.get(name) ?? { boards: 0, imp: 0 };
    e.boards++;
    e.imp += imp;
    map.set(name, e);
  };
  for (const r of ds.results) {
    if (events && !events.has(r.eventId)) continue;
    for (const n of r.nsPair) add(n, r.nsButler);
    for (const n of r.ewPair) add(n, r.ewButler);
  }
  return map;
}

export function buildReport(ds: Dataset, name: string, filter: PlayerFilter = {}): PlayerReport {
  const boards = playerBoards(ds.results, name, filter);
  const classified = classifyAll(boards, ds.byBoard);
  const tricks = trickStats(boards, ds.byBoard);
  const categories = categoryStats(classified);
  const butler = sum(boards.map((b) => b.butler));
  const overbidCount = classified.filter((c) => c.overbid).length;
  const { insights, headline, lowSample } = generateInsights({ boards: boards.length, categories, declare: tricks.declare, defend: tricks.defend, overbidCount });

  // 排名：只比較同樣篩選賽事、且牌數至少為本人一半的賽員，避免只打一輪的人排在最前面
  let rank: PlayerReport['rank'] = null;
  if (boards.length > 0 && !filter.partner) {
    const avgs = playerAverages(ds, filter.eventIds);
    const minBoards = Math.max(1, Math.floor(boards.length / 2));
    const pool = [...avgs.entries()].filter(([n, v]) => n === name || v.boards >= minBoards).map(([n, v]) => ({ n, avg: v.imp / v.boards }));
    const mine = butler / boards.length;
    const position = pool.filter((p) => p.n !== name && p.avg > mine).length + 1;
    const below = pool.filter((p) => p.n !== name && p.avg < mine).length;
    rank = { position, of: pool.length, percentile: pool.length > 1 ? (below / (pool.length - 1)) * 100 : 100 };
  }

  const sideLabel = (s: Side) => (s === 'NS' ? '南北' : '東西');
  const partners = groupStats(classified, (pb) => pb.partner, (k) => k, tricks);
  const seats = groupStats(classified, (pb) => pb.side, (k) => sideLabel(k as Side), tricks);

  const roundMap = new Map<string, RoundStat>();
  for (const pb of boards) {
    const r = pb.result;
    const k = `${r.eventId}|${r.round}`;
    let e = roundMap.get(k);
    if (!e) {
      const oppTeam = pb.side === 'NS' ? r.ewTeam : r.nsTeam;
      e = { eventId: r.eventId, eventName: ds.eventNames.get(r.eventId) ?? r.eventId, round: r.round, opponent: ds.teamNames.get(`${r.eventId}#${oppTeam}`) ?? `#${oppTeam}`, side: sideLabel(pb.side), boards: 0, imp: 0 };
      roundMap.set(k, e);
    }
    e.boards++;
    e.imp += pb.butler;
  }

  const toReview = (item: Classified): ReviewItem => ({
    item,
    deal: ds.deals.get(boardKey(item.pb.result)) ?? null,
    field: [...(ds.byBoard.get(boardKey(item.pb.result)) ?? [])].sort((a, b) => b.nsScore - a.nsScore),
  });
  const sorted = [...classified].filter((c) => c.category !== 'adjusted').sort((a, b) => a.pb.butler - b.pb.butler || a.pb.result.board - b.pb.result.board);
  const worst = sorted.slice(0, thresholds.reviewWorst);
  const best = sorted.slice(-thresholds.reviewBest).reverse().filter((x) => !worst.includes(x));

  // 只有全部牌局都來自同一種計分方式的雙人賽時，成績表分數才能加總
  let sheetScore: PlayerReport['sheetScore'] = null;
  const scorings = new Set(boards.map((b) => ds.eventInfo.get(b.result.eventId)?.scoring));
  if (boards.length > 0 && scorings.size === 1 && boards.every((b) => b.result.nsSheetImp !== undefined)) {
    const scoring = [...scorings][0];
    sheetScore = {
      label: scoring === 'cross-imp' ? 'Cross-IMP' : 'Butler',
      imp: sum(boards.map((b) => (b.side === 'NS' ? b.result.nsSheetImp! : -b.result.nsSheetImp!))),
    };
  }

  return {
    name,
    boards: boards.length,
    butler,
    perBoard: boards.length ? butler / boards.length : 0,
    rank,
    categories,
    declare: tricks.declare,
    defend: tricks.defend,
    partners,
    seats,
    rounds: [...roundMap.values()],
    overbidCount,
    sheetScore,
    insights,
    headline,
    lowSample,
    review: { worst: worst.map(toReview), best: best.map(toReview) },
    classified,
  };
}
