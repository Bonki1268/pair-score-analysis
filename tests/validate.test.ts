import { describe, expect, test } from 'vitest';
import { datumMismatches, validateEvent } from '../src/engine/validate';
import { dataFiles, load } from './helpers';

describe.skipIf(dataFiles.length === 0)('自我核對能抓出錯誤', () => {
  // 用隊制賽成績表測試（雙人賽的核對項目不同）
  const p = () => load(dataFiles.find((f) => load(f).event.kind === 'teams')!);

  test('解析出錯時核對會失敗', () => {
    const broken = { ...p(), results: p().results.map((r, i) => (i === 0 ? { ...r, nsButler: r.nsButler + 1, ewButler: r.ewButler - 1 } : r)).slice(0, -1) };
    const status = Object.fromEntries(validateEvent(broken).map((c) => [c.id, c.status]));
    expect(status.count).toBe('fail');
    expect(status.butler).toBe('fail');
  });

  test('缺少工作表時標記為略過而不是失敗', () => {
    const status = Object.fromEntries(validateEvent({ ...p(), sheetPairButler: [], deals: [] }).map((c) => [c.id, c.status]));
    expect(status.butler).toBe('skip');
    expect(status.deals).toBe('skip');
  });

  test('成績事後被修改、沒有重算 Datum 與 Butler → 提醒，列出原成績', () => {
    const clean = load(dataFiles.find((f) => load(f).event.kind === 'teams' && validateEvent(load(f)).every((c) => c.status !== 'fail' && c.status !== 'warn'))!);
    const target = clean.results.find((r) => !r.contract.adjusted)!;
    const edited = { ...clean, results: clean.results.map((r) => (r === target ? { ...r, nsScore: r.nsScore + 1000 } : r)) };
    const check = validateEvent(edited).find((c) => c.id === 'datum')!;
    expect(check.status).toBe('warn');
    expect(check.detail).toContain(`第 ${target.board} 副第 ${target.table} 桌`);
    const { stale, unexplained } = datumMismatches(edited);
    expect(unexplained).toEqual([]);
    expect(stale).toHaveLength(1);
    const [lo, hi] = stale[0].original;
    expect(target.nsScore).toBeGreaterThanOrEqual(lo);
    expect(target.nsScore).toBeLessThanOrEqual(hi);
  });

  test('Datum 無法用單一桌改成績解釋 → 仍然失敗', () => {
    const clean = load(dataFiles.find((f) => load(f).event.kind === 'teams' && validateEvent(load(f)).every((c) => c.status !== 'fail' && c.status !== 'warn'))!);
    const board = clean.results[0];
    const same = (r: typeof board) => r.round === board.round && r.board === board.board;
    const edited = { ...clean, results: clean.results.map((r) => (same(r) ? { ...r, datum: r.datum + 500 } : r)) };
    expect(validateEvent(edited).find((c) => c.id === 'datum')!.status).toBe('fail');
  });
});
