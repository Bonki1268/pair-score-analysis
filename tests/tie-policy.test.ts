import { describe, expect, test } from 'vitest';
import { classifyBoard, formatTied, mainstreamCandidates, type TiePolicy } from '../src/engine/classify';
import { toPlayerBoard } from '../src/engine/player-boards';
import { buildDataset, buildReport } from '../src/engine/report';
import { br } from './fixtures';
import { dataFiles, golden, load } from './helpers';

describe('主流合約平手', () => {
  const classify = (field: ReturnType<typeof br>[], mine: ReturnType<typeof br>, tiePolicy: TiePolicy, side: 'NS' | 'EW' = 'NS') =>
    classifyBoard(toPlayerBoard(mine, side, side === 'NS' ? mine.nsPair[0] : mine.ewPair[0]), [...field, mine], tiePolicy);

  test('Pass 自成一種合約參與計數', () => {
    const c = mainstreamCandidates([br('P'), br('P'), br('P'), br('1NS1'), br('2NN2')]);
    expect(c.map((x) => [x.key, x.count])).toEqual([['PASS', 3]]);
  });

  test('自己與主流都 Pass → Pass 局；lowest 維持舊的防守', () => {
    const field = [br('P'), br('P'), br('1NS1')];
    expect(classify(field, br('P'), 'separate').category).toBe('passed-out');
    expect(classify(field, br('P'), 'lowest').category).toBe('defense');
  });

  test('平手且不同候選得到不同類別 → 全場無共識，列出候選', () => {
    // 南北 2♥ 與 南北 4♥ 各 2 桌：自己 4♥ 對 2♥ 是成局判斷、對 4♥ 是做莊
    const field = [br('2HS2'), br('2HN3'), br('4HS4')];
    const r = classify(field, br('4HS-1'), 'separate');
    expect(r.category).toBe('no-consensus');
    expect(formatTied(r.tied)).toBe('南北 2♥／南北 4♥ 各 2 桌');
    expect(classify(field, br('4HS-1'), 'lowest').category).toBe('game-slam');
  });

  test('平手但每個候選都得到同一類別 → 照常歸類', () => {
    // 南北 4♥ 與 南北 4♠ 各 2 桌：自己東西主打，對兩個候選都是競叫
    const field = [br('4HS4'), br('4HN4'), br('4SS4')];
    const r = classify(field, br('5DE-2'), 'separate');
    expect(r.category).toBe('competitive');
    expect(r.tied).toEqual([]);
  });
});

// 驗收：第 28 屆植鑑盃混合組，指定賽員（搭檔、9 輪 108 副）；姓名在 資料/golden.json
const tp = golden?.tiePolicy;
describe.skipIf(!tp || !dataFiles.includes(tp.file))('主流合約平手：植鑑盃驗收', () => {
  const report = (tiePolicy: TiePolicy) => buildReport(buildDataset([load(tp!.file)]), tp!.player, {}, { tiePolicy });
  const table = (rep: ReturnType<typeof report>) => Object.fromEntries(rep.categories.map((c) => [c.label, [c.boards, c.imp]]));
  const boardsOf = (rep: ReturnType<typeof report>, id: string) =>
    rep.classified.filter((c) => c.category === id).map((c) => `R${c.pb.result.round}-${c.pb.result.board}`);

  test.each(['lowest', 'separate'] as const)('%s：總副數 108、總 IMP +51，各類加總等於 Butler', (policy) => {
    const rep = report(policy);
    expect(rep.boards).toBe(108);
    expect(rep.butler).toBe(51);
    expect(new Set(rep.classified.map((c) => c.pb.partner))).toEqual(new Set([tp!.partner]));
    expect(rep.categories.reduce((s, c) => s + c.boards, 0)).toBe(108);
    expect(rep.categories.reduce((s, c) => s + c.imp, 0)).toBe(51);
  });

  test('lowest：和舊報告完全一致', () => {
    expect(table(report('lowest'))).toEqual({
      競叫: [9, 15],
      '成局／滿貫判斷': [19, -7],
      選擇王牌: [4, -4],
      叫牌高度: [4, 3],
      做莊: [38, 76],
      防守: [34, -32],
    });
  });

  test('separate：新增全場無共識與 Pass 局', () => {
    const rep = report('separate');
    expect(table(rep)).toEqual({
      競叫: [8, 14],
      '成局／滿貫判斷': [14, 15],
      選擇王牌: [4, -4],
      叫牌高度: [4, 3],
      做莊: [38, 76],
      防守: [31, -36],
      全場無共識: [8, -17],
      'Pass 局': [1, 0],
    });
    expect(rep.categories.at(-1)!.id).toBe('no-consensus');
    expect(boardsOf(rep, 'no-consensus')).toEqual(['R1-12', 'R2-14', 'R2-15', 'R5-1', 'R8-15', 'R8-19', 'R9-8', 'R9-10']);
    expect(boardsOf(rep, 'passed-out')).toEqual(['R8-13']);
    for (const c of rep.classified.filter((x) => x.category === 'no-consensus')) expect(c.tied.length).toBeGreaterThan(1);
  });

  test('預設為 separate', () => {
    expect(buildReport(buildDataset([load(tp!.file)]), tp!.player).categories.map((c) => c.id)).toContain('no-consensus');
  });
});
