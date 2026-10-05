// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { buildDataset, buildReport } from '../src/engine/report';
import { buildIndex } from '../src/index/players';
import { renderReport } from '../src/ui/report';
import { renderSearch } from '../src/ui/search';
import { renderUpload } from '../src/ui/upload';
import { golden, goldenFiles, hasGolden, load } from './helpers';

describe.skipIf(!hasGolden || !golden?.merged)('介面渲染', () => {
  const ds = () => buildDataset(goldenFiles.map(load));
  const m = () => golden!.merged!;

  test('上傳區列出賽事摘要與核對結果', () => {
    const d = ds();
    const el = renderUpload(d.events, ['「x.xlsx」不是支援的成績表'], { onFiles: () => {}, onDelete: () => {} });
    for (const file of goldenFiles) {
      const g = golden!.files[file];
      expect(el.textContent).toContain(`${g.results} 筆桌次結果`);
    }
    expect(el.querySelector('[role=alert]')!.textContent).toContain('不是支援的成績表');
    const checks = [...el.querySelectorAll('.checks summary')].map((x) => x.textContent);
    // 成績表沒有提供 Datum 時該項略過，所以只要求全部通過
    expect(checks).toHaveLength(goldenFiles.length);
    for (const c of checks) expect(c).toMatch(/^核對 (\d)\/\1 項通過$/);
  });

  test('搜尋列出候選人', () => {
    const d = ds();
    const el = renderSearch(buildIndex(d.events, d.results), m().query);
    const first = el.querySelector('a.candidate')!;
    expect(first.textContent).toContain(m().player);
    expect(m().teams.some((t) => first.textContent!.includes(t))).toBe(true);
    expect(first.textContent).toContain(`${m().boards} 副`);
    expect(first.getAttribute('href')).toBe(`#/p/${encodeURIComponent(m().player)}`);
  });

  test('報告頁顯示正確數字與各區塊', () => {
    const d = ds();
    const file = goldenFiles.find((f) => load(f).event.kind === 'teams')!;
    const g = golden!.files[file].pairs.find((x) => x.pair.includes(m().player))!;
    const partner = g.pair.find((n) => n !== m().player)!;
    const eventId = load(file).event.eventId;
    const params = { name: m().player, event: eventId, partner };
    const rep = buildReport(d, m().player, { eventIds: [eventId], partner });
    const el = renderReport(d, rep, params, buildIndex(d.events, d.results).get(m().player)!);
    const stats = [...el.querySelectorAll('.stat')].map((s) => s.textContent!.replace(/\s+/g, ''));
    expect(stats[0]).toBe(`牌數${g.boards}`);
    expect(stats[1]).toContain(g.imp > 0 ? `+${g.imp}` : String(g.imp));
    for (const title of ['摘要', '輸贏分類', '做莊與防守', '搭檔比較', '座位與輪次', '復盤清單', '方法說明']) {
      expect(el.textContent).toContain(title);
    }
    expect(el.querySelectorAll('details.review')).toHaveLength(8);
    expect(el.querySelectorAll('.deal').length).toBe(8);
    expect(el.querySelector('.suit-red, .suit-black')).not.toBeNull();
    expect(el.querySelectorAll('svg.chart').length).toBe(2);
  });
});
