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

/**
 * 自算 Datum（南北觀點）：全場平均後往 0 截到 10 分。
 * 與 Swiss R 格式成績表的 Datum 逐副比對完全一致；調整分不列入。
 */
export function computeDatum(nsScores: number[]): number {
  if (nsScores.length === 0) return 0;
  const mean = nsScores.reduce((s, x) => s + x, 0) / nsScores.length;
  return Math.trunc(mean / 10) * 10 || 0;
}

export function butlerOf(nsScore: number, datum: number): number {
  return toImp(nsScore - datum);
}

/** 同一副牌（同賽事、同輪、同牌號）的全場結果 */
export function boardKey(r: Pick<BoardResult, 'eventId' | 'round' | 'board'>): string {
  return `${r.eventId}|${r.round}|${r.board}`;
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
