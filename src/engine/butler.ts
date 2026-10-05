import type { BoardResult } from '../model/types';

// WBF IMP 換算表：分差達到 IMP_STEPS[i] 即得 i+1 IMP
const IMP_STEPS = [
  20, 50, 90, 130, 170, 220, 270, 320, 370, 430, 500, 600, 750, 900, 1100, 1300, 1500, 1750, 2000,
  2250, 2500, 3000, 3500, 4000,
];

export function toImp(diff: number): number {
  const a = Math.abs(diff);
  let imp = 0;
  while (imp < IMP_STEPS.length && a >= IMP_STEPS[imp]) imp++;
  return diff < 0 && imp > 0 ? -imp : imp;
}

export type DatumMethod = 'mean' | 'trimmed';

/**
 * 自算 Datum（南北觀點），往 0 截到 10 分；調整分不列入。
 * - mean：全場平均（與 Swiss R 格式隊制賽成績表逐副一致）
 * - trimmed：去掉最高與最低各一筆後平均（與雙人賽「牌局分析」的 Mean 一致）
 */
export function computeDatum(nsScores: number[], method: DatumMethod = 'mean'): number {
  if (nsScores.length === 0) return 0;
  const sorted = [...nsScores].sort((a, b) => a - b);
  const kept = method === 'trimmed' && sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
  const mean = kept.reduce((s, x) => s + x, 0) / kept.length;
  return Math.trunc(mean / 10) * 10 || 0;
}

/** Cross-IMP：和同一副牌其他每一桌比，換成 IMP 後加總 */
export function crossImp(nsScore: number, others: number[]): number {
  return others.reduce((s, o) => s + toImp(nsScore - o), 0);
}

export function butlerOf(nsScore: number, datum: number): number {
  return toImp(nsScore - datum);
}

/** 同一副牌（同賽事、同牌組、同牌號）的鍵值；BoardResult 與 Deal 都適用 */
export function boardKey(r: { eventId: string; round: number; board: number; dealRound?: number }): string {
  return `${r.eventId}|${r.dealRound ?? r.round}|${r.board}`;
}

export function groupByBoard(results: BoardResult[]): Map<string, BoardResult[]> {
  const map = new Map<string, BoardResult[]>();
  for (const r of results) {
    const k = boardKey(r);
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(r);
  }
  return map;
}
