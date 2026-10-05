import { describe, expect, test } from 'vitest';
import { buildDataset, buildReport } from '../src/engine/report';
import { buildIndex, search } from '../src/index/players';
import { golden, goldenFiles, hasGolden, load } from './helpers';

describe.skipIf(!hasGolden || !golden?.merged)('個人報告（端對端：上傳 → 搜尋 → 報告）', () => {
  const ds = () => buildDataset(goldenFiles.map(load));
  const m = () => golden!.merged!;

  test('搜尋找到指定賽員', () => {
    const d = ds();
    const r = search(buildIndex(d.events, d.results), m().query);
    expect(r[0].name).toBe(m().player);
    for (const e of r[0].entries) expect(m().teams).toContain(e.teamName);
  });

  test('每份賽事中與指定搭檔的牌數與 Butler', () => {
    const d = ds();
    for (const file of goldenFiles) {
      for (const g of golden!.files[file].pairs) {
        if (!g.pair.includes(m().player) || g.score === 'sheet') continue;
        const partner = g.pair.find((n) => n !== m().player)!;
        const rep = buildReport(d, m().player, { eventIds: [load(file).event.eventId], partner });
        expect({ boards: rep.boards, imp: rep.butler }).toEqual({ boards: g.boards, imp: g.imp });
      }
    }
  });

  test('合併所有賽事', () => {
    const rep = buildReport(ds(), m().player);
    expect(rep.boards).toBe(m().boards);
    expect(rep.butler).toBe(m().imp);
    // 每副牌都恰好歸入一類，各類 IMP 加總等於總 Butler
    expect(rep.categories.reduce((s, c) => s + c.boards, 0)).toBe(rep.boards);
    expect(rep.categories.reduce((s, c) => s + c.imp, 0)).toBe(rep.butler);
    expect(rep.review.worst).toHaveLength(5);
    expect(rep.review.best).toHaveLength(3);
    expect(rep.review.worst.every((x) => x.deal !== null)).toBe(true);
    expect(rep.rank!.of).toBeGreaterThan(10);
  });
});
