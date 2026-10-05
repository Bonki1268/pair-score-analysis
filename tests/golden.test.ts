import { describe, expect, test } from 'vitest';
import { butlerOf } from '../src/engine/butler';
import { validateEvent } from '../src/engine/validate';
import { pairKey } from '../src/parsers/names';
import { dataFiles, golden, goldenFiles, load } from './helpers';

// 任何一份成績表都適用：用成績表自己的數字互相核對（與網頁上傳後的核對相同）
describe.skipIf(dataFiles.length === 0)('自我核對：資料/ 底下的每份成績表', () => {
  describe.each(dataFiles)('%s', (file) => {
    test.each(validateEvent(load(file)).map((c) => [c.label, c] as const))('%s', (_label, c) => {
      expect(c.status, c.detail).not.toBe('fail');
    });

    test('Butler 等於 IMP(得分 − Datum)', () => {
      for (const r of load(file).results) {
        if (r.contract.adjusted) continue;
        expect(butlerOf(r.nsScore, r.datum)).toBe(r.nsButler);
      }
    });
  });
});

// 架構書第 9 節的黃金標準值；實際數字與姓名在 資料/golden.json
describe.skipIf(goldenFiles.length === 0)('黃金標準值', () => {
  describe.each(goldenFiles)('%s', (file) => {
    const want = () => golden!.files[file];
    const p = () => load(file);

    test('賽事規模與桌次筆數', () => {
      expect(p().results.length).toBe(want().results);
      expect(p().teams.length).toBe(want().teams);
      expect(p().event.rounds).toBe(want().rounds);
      expect(p().event.boardsPerRound).toBe(want().boardsPerRound);
    });

    test('冠軍隊與戰績', () => {
      const champ = p().teams.find((t) => t.rank === 1)!;
      expect(champ.name).toBe(want().champion.name);
      expect(champ.finalVp).toBeCloseTo(want().champion.vp, 2);
      if (want().champion.wins === undefined) return;
      let w = 0;
      let l = 0;
      for (const m of p().matches) {
        const net = m.homeTeam === champ.teamNo ? m.homeImp - m.awayImp : m.awayTeam === champ.teamNo ? m.awayImp - m.homeImp : null;
        if (net === null) continue;
        if (net > 0) w++;
        else if (net < 0) l++;
      }
      expect([w, l]).toEqual([want().champion.wins, want().champion.losses]);
    });

    test('指定配對的牌數與 Butler', () => {
      for (const g of want().pairs) {
        let boards = 0;
        let imp = 0;
        for (const r of p().results) {
          if (pairKey(r.nsPair) === pairKey(g.pair)) (boards++, (imp += r.nsButler));
          if (pairKey(r.ewPair) === pairKey(g.pair)) (boards++, (imp += r.ewButler));
        }
        expect({ boards, imp }).toEqual({ boards: g.boards, imp: g.imp });
      }
    });
  });
});
