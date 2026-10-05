import { describe, expect, test } from 'vitest';
import { validateEvent } from '../src/engine/validate';
import { dataFiles, load } from './helpers';

describe.skipIf(dataFiles.length === 0)('自我核對能抓出錯誤', () => {
  const p = () => load(dataFiles[0]);

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
});
