import { describe, expect, test } from 'vitest';
import { computeDatum, crossImp, toImp } from '../src/engine/butler';
import { bonusTier, classifyBoard, mainstreamContract } from '../src/engine/classify';
import { generateInsights } from '../src/engine/insights';
import { toPlayerBoard } from '../src/engine/player-boards';
import { compareTricks, summarizeTricks } from '../src/engine/trick-diff';
import type { CategoryStat } from '../src/engine/classify';
import type { TrickStat } from '../src/engine/trick-diff';
import { br } from './fixtures';

describe('IMP 換算', () => {
  test.each([
    [0, 0], [10, 0], [20, 1], [40, 1], [50, 2], [90, 3], [420, 9], [430, 10], [500, 11],
    [1000, 14], [1430, 16], [2000, 19], [4000, 24], [9999, 24], [-20, -1], [-640, -12],
  ])('%i → %i', (diff, imp) => expect(toImp(diff)).toBe(imp));
  test('0 不會是 −0', () => expect(Object.is(toImp(-10), 0)).toBe(true));
});

test('computeDatum：平均後往 0 截到 10 分', () => {
  expect(computeDatum([170, 420, 420, -100])).toBe(220); // 227.5
  expect(computeDatum([-170, -420, -420, 100])).toBe(-220);
  expect(computeDatum([])).toBe(0);
});

test('computeDatum trimmed：去掉最高與最低各一筆（雙人賽牌局分析的 Mean）', () => {
  // 1430 與 500 被去掉：(680×4 + 650) / 5 = 674 → 670
  expect(computeDatum([1430, 680, 680, 680, 680, 650, 500], 'trimmed')).toBe(670);
  expect(computeDatum([50, -90, -120, -120, -120, -140, -140], 'trimmed')).toBe(-110);
});

test('crossImp：和其他每一桌比後加總', () => {
  // 420 對 420、170、−50：0 + 6 + 10
  expect(crossImp(420, [420, 170, -50])).toBe(16);
  expect(crossImp(-50, [420, 170, 420])).toBe(-10 - 6 - 10);
});

describe('墩差', () => {
  const field = [br('4HS4'), br('4HN5'), br('4HS-1'), br('4HS-2'), br('3NS3')];
  const mine = field[0];

  test('做莊：自己墩數 − 比較桌平均', () => {
    const pb = toPlayerBoard(mine, 'NS', mine.nsPair[0]);
    const c = compareTricks(pb, field)!;
    // 比較桌：4HN5(11) 4HS-1(9) 4HS-2(8)，平均 9.33；3NT 不同花色不列入
    expect(c.tables).toBe(3);
    expect(c.diff).toBeCloseTo(10 - 28 / 3);
  });

  test('防守：比較桌平均 − 對手墩數', () => {
    const pb = toPlayerBoard(mine, 'EW', mine.ewPair[0]);
    expect(pb.role).toBe('defend');
    expect(compareTricks(pb, field)!.diff).toBeCloseTo(28 / 3 - 10);
  });

  test('比較桌少於 3 桌不計算', () => {
    const f = [br('4HS4'), br('4HS5'), br('4HS-1')];
    expect(compareTricks(toPlayerBoard(f[0], 'NS', 'x'), f)).toBeNull();
  });

  test('較好／較差以 0.5 墩為界', () => {
    const items = [0.5, 0.4, -0.5, -0.4, 1].map((diff) => ({ diff }) as never);
    const s = summarizeTricks(items);
    expect([s.better, s.worse]).toEqual([2, 1]);
  });
});

describe('輸贏分類', () => {
  // 主流：南北 4♥（3 桌）
  const base = () => [br('4HS4'), br('4HN4'), br('4HS5')];
  const classify = (contract: string, side: 'NS' | 'EW' = 'NS') => {
    const mine = br(contract);
    const field = [...base(), mine];
    return classifyBoard(toPlayerBoard(mine, side, side === 'NS' ? mine.nsPair[0] : mine.ewPair[0]), field);
  };

  test('主流合約', () => expect(mainstreamContract(base()).key).toBe('NS|4|H'));
  test('同合約、我方主打 → 做莊', () => expect(classify('4HS-1').category).toBe('declarer'));
  test('同合約、對方主打 → 防守', () => expect(classify('4HN4', 'EW').category).toBe('defense'));
  test('主打方不同 → 競叫', () => expect(classify('4SXE-2').category).toBe('competitive'));
  test('一邊 Pass → 競叫', () => expect(classify('P').category).toBe('competitive'));
  test('跨成局線 → 成局／滿貫判斷', () => expect(classify('3HS4').category).toBe('game-slam'));
  test('跨滿貫線 → 成局／滿貫判斷', () => expect(classify('6HS-1').category).toBe('game-slam'));
  test('同層級不同花色 → 選擇王牌', () => expect(classify('3NN4').category).toBe('strain'));
  test('同花色同層級不同階 → 叫牌高度', () => expect(classify('5HS-1').category).toBe('level'));
  test('調整分另計', () => expect(classify('A').category).toBe('adjusted'));
  test('主打宕 2 墩以上標記超叫', () => {
    expect(classify('4HS-2').overbid).toBe(true);
    expect(classify('4HS-1').overbid).toBe(false);
    expect(classify('4HN-3', 'EW').overbid).toBe(false);
  });
  test('獎分層級', () => {
    expect([bonusTier(0, null), bonusTier(2, 'H'), bonusTier(3, 'N'), bonusTier(4, 'S'), bonusTier(4, 'C'), bonusTier(5, 'D'), bonusTier(6, 'C'), bonusTier(7, 'N')]).toEqual([0, 1, 2, 2, 1, 2, 3, 4]);
  });
});

describe('結論規則', () => {
  const trick = (count: number, m: number): TrickStat => ({ count, mean: m, better: 0, worse: 0, items: [] });
  const cat = (id: CategoryStat['id'], label: string, boards: number, perBoard: number): CategoryStat => ({ id, label, boards, imp: boards * perBoard, perBoard });
  const run = (over: Partial<Parameters<typeof generateInsights>[0]>) =>
    generateInsights({ boards: 40, categories: [], declare: trick(0, 0), defend: trick(0, 0), overbidCount: 0, declared: 0, ...over });

  test('弱項：每牌 ≤ −1.0 且 ≥ 4 副', () => {
    expect(run({ categories: [cat('competitive', '競叫', 4, -1)] }).insights[0].text).toBe('主要失分在競叫');
    expect(run({ categories: [cat('competitive', '競叫', 3, -5)] }).insights).toEqual([]);
    expect(run({ categories: [cat('competitive', '競叫', 4, -0.99)] }).insights).toEqual([]);
  });
  test('強項：每牌 ≥ +1.0 且 ≥ 4 副', () => {
    expect(run({ categories: [cat('strain', '選擇王牌', 10, 1)] }).insights[0].text).toBe('選擇王牌是得分來源');
  });
  test('做莊與防守的 Butler 不觸發強弱項（改用墩差）', () => {
    expect(run({ categories: [cat('declarer', '做莊', 10, 3), cat('defense', '防守', 10, -3)] }).insights).toEqual([]);
  });
  test('做莊／防守偏弱：墩差 ≤ −0.3 且 ≥ 8 副', () => {
    expect(run({ declare: trick(8, -0.3) }).insights.map((i) => i.kind)).toEqual(['declare-weak']);
    expect(run({ declare: trick(7, -1) }).insights).toEqual([]);
    expect(run({ defend: trick(8, -0.31) }).insights.map((i) => i.kind)).toEqual(['defend-weak']);
    expect(run({ defend: trick(8, -0.29) }).insights).toEqual([]);
  });
  test('超叫：主打 ≥ 8 副，其中宕 2 墩以上 ≥ 20%', () => {
    expect(run({ boards: 50, declared: 20, overbidCount: 4 }).insights.map((i) => i.kind)).toEqual(['overbid']);
    expect(run({ boards: 50, declared: 20, overbidCount: 3 }).insights).toEqual([]);
    // 分母是主打副數，不是總牌數：總牌數多但主打少時照樣觸發
    expect(run({ boards: 100, declared: 10, overbidCount: 2 }).insights.map((i) => i.kind)).toEqual(['overbid']);
    // 主打不到 8 副不下結論
    expect(run({ boards: 50, declared: 7, overbidCount: 7 }).insights).toEqual([]);
  });
  test('樣本不足加註', () => {
    expect(run({ boards: 19 }).lowSample).toBe(true);
    expect(run({ boards: 19 }).headline).toContain('僅供參考');
    expect(run({ boards: 20 }).lowSample).toBe(false);
  });
  test('一句話摘要', () => {
    const r = run({ declare: trick(10, 0.2), categories: [cat('competitive', '競叫', 6, -2)] });
    expect(r.headline).toBe('做莊穩定，主要失分在競叫');
  });
});
