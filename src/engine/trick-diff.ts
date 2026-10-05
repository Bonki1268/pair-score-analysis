import type { BoardResult } from '../model/types';
import { sideOf } from '../model/types';
import thresholds from '../config/thresholds.json';
import { boardKey } from './butler';
import type { PlayerBoard } from './player-boards';
import { mean } from './player-boards';

export interface TrickComparison {
  pb: PlayerBoard;
  /** 這桌主打方拿到的墩數 */
  tricks: number;
  fieldMean: number;
  tables: number;
  /** 正數 = 比全場好（做莊多拿、防守少讓） */
  diff: number;
}

export interface TrickStat {
  count: number;
  mean: number;
  better: number;
  worse: number;
  items: TrickComparison[];
}

/** 同一副牌、同一方主打、同階、同花色的其他桌次 */
export function comparableTables(r: BoardResult, field: BoardResult[]): BoardResult[] {
  const c = r.contract;
  if (c.adjusted || c.level === 0 || !c.declarer) return [];
  const side = sideOf(c.declarer);
  return field.filter(
    (o) =>
      o !== r &&
      !o.contract.adjusted &&
      o.contract.declarer !== null &&
      sideOf(o.contract.declarer) === side &&
      o.contract.level === c.level &&
      o.contract.strain === c.strain,
  );
}

export function compareTricks(pb: PlayerBoard, field: BoardResult[], minTables = thresholds.trickCompareMinTables): TrickComparison | null {
  if (pb.role !== 'declare' && pb.role !== 'defend') return null;
  const others = comparableTables(pb.result, field);
  if (others.length < minTables) return null;
  const fieldMean = mean(others.map((o) => o.contract.tricks));
  const tricks = pb.result.contract.tricks;
  const diff = pb.role === 'declare' ? tricks - fieldMean : fieldMean - tricks;
  return { pb, tricks, fieldMean, tables: others.length, diff };
}

export function summarizeTricks(items: TrickComparison[], margin = thresholds.trickBetterWorseMargin): TrickStat {
  return {
    count: items.length,
    mean: mean(items.map((i) => i.diff)),
    better: items.filter((i) => i.diff >= margin).length,
    worse: items.filter((i) => i.diff <= -margin).length,
    items,
  };
}

export function trickStats(boards: PlayerBoard[], byBoard: Map<string, BoardResult[]>) {
  const declare: TrickComparison[] = [];
  const defend: TrickComparison[] = [];
  for (const pb of boards) {
    const cmp = compareTricks(pb, byBoard.get(boardKey(pb.result)) ?? []);
    if (!cmp) continue;
    (pb.role === 'declare' ? declare : defend).push(cmp);
  }
  return { declare: summarizeTricks(declare), defend: summarizeTricks(defend) };
}
