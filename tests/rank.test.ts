import { describe, expect, test } from 'vitest';
import { buildDataset, buildReport } from '../src/engine/report';
import type { BoardResult, ParsedEvent } from '../src/model/types';
import { br } from './fixtures';

function event(eventId: string, results: BoardResult[]): ParsedEvent {
  return {
    event: { eventId, name: eventId, kind: 'pairs', scoring: 'butler', division: '', rounds: 1, boardsPerRound: 1, fileName: `${eventId}.xls`, importedAt: '' },
    teams: [],
    matches: [],
    results,
    deals: [],
    warnings: [],
    sheetPairButler: [],
  };
}

/** 南北得 imp，東西得 −imp */
const row = (eventId: string, nsTeam: number, ns: [string, string], ewTeam: number, ew: [string, string], imp: number) =>
  br('4HS4', { eventId, nsTeam, ewTeam, nsPair: ns, ewPair: ew, nsButler: imp, ewButler: -imp });

describe('排名把同一賽事的同名不同人分開', () => {
  // 賽事 A 有兩位「王明」：第 1 隊每副 +3，第 2 隊每副 −3
  const ds = buildDataset([
    event('A', [
      row('A', 1, ['王明', '甲'], 3, ['丙', '丁'], 3),
      row('A', 1, ['王明', '甲'], 3, ['丙', '丁'], 3),
      row('A', 2, ['王明', '乙'], 4, ['戊', '己'], -3),
      row('A', 2, ['王明', '乙'], 4, ['戊', '己'], -3),
    ]),
  ]);

  test('選第 1 隊時，第 2 隊的王明列為另一位比較對象', () => {
    const rep = buildReport(ds, '王明', { teams: ['A#1'] });
    // 比較池：王明（第 1 隊，本人）、甲、丙、丁、王明（第 2 隊）、乙、戊、己
    // 甲、戊、己同為 +3 不算贏過；丙、丁、第 2 隊王明、乙為 −3
    expect(rep.rank).toEqual({ position: 1, of: 8, percentile: 100 * (4 / 7) });
  });

  test('選第 2 隊時排在最後一群', () => {
    const rep = buildReport(ds, '王明', { teams: ['A#2'] });
    expect(rep.rank!.of).toBe(8);
    expect(rep.rank!.percentile).toBe(0);
  });

  test('沒選隊伍時，兩位王明都算本人，不互相比較', () => {
    const rep = buildReport(ds, '王明');
    expect(rep.rank!.of).toBe(7);
  });
});
