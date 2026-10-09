import { describe, expect, test } from 'vitest';
import { refreshEvents } from '../src/model/reparse';
import type { StoredEvent } from '../src/model/store';
import type { ParsedEvent } from '../src/model/types';
import { br } from './fixtures';

function ev(eventId: string, name: string, nsScore: number, importedAt = '2026-10-01'): ParsedEvent {
  return {
    event: { eventId, name, kind: 'pairs', scoring: 'butler', division: '', rounds: 1, boardsPerRound: 1, fileName: 'a.xls', importedAt },
    teams: [],
    matches: [],
    results: [br('4HS4', { eventId, matchId: `${eventId}|R1|1v2`, nsScore })],
    deals: [],
    warnings: [],
    sheetPairButler: [],
  };
}

const bytes = new Uint8Array([1, 2, 3]);
/** 模擬新版解析器：標題是「週三賽」，得分和舊結果不同 */
const parse = async () => ev('週三賽', '週三賽', 450, '2026-10-10');

describe('解析器更新後重新解析已存的賽事', () => {
  test('版本相同 → 不重新解析', async () => {
    const s: StoredEvent = { parsed: ev('週三賽', '週三賽', 420), data: bytes, parserVersion: 'v2' };
    const r = await refreshEvents([s], 'v2', parse);
    expect(r).toEqual({ events: [s], updated: [], stale: [] });
  });

  test('版本不同且有原始檔 → 重新解析，沿用賽事 ID、名稱與匯入時間', async () => {
    const s: StoredEvent = { parsed: ev('週三賽（1007）', '週三賽（1007）', 420), data: bytes, parserVersion: 'v1' };
    const r = await refreshEvents([s], 'v2', parse);
    expect(r.stale).toEqual([]);
    expect(r.updated).toHaveLength(1);
    const p = r.events[0];
    expect(p.parserVersion).toBe('v2');
    expect(p.data).toBe(bytes);
    expect(p.parsed.event).toMatchObject({ eventId: '週三賽（1007）', name: '週三賽（1007）', title: '週三賽', importedAt: '2026-10-01' });
    expect(p.parsed.results[0]).toMatchObject({ eventId: '週三賽（1007）', matchId: '週三賽（1007）|R1|1v2', nsScore: 450 });
  });

  test('早期版本沒有原始檔 → 保留舊結果並列為需要重新上傳', async () => {
    const s: StoredEvent = { parsed: ev('週三賽', '週三賽', 420), data: null, parserVersion: null };
    const r = await refreshEvents([s], 'v2', parse);
    expect(r).toEqual({ events: [s], updated: [], stale: ['週三賽'] });
  });

  test('重新解析失敗 → 保留舊結果並列為需要重新上傳', async () => {
    const s: StoredEvent = { parsed: ev('週三賽', '週三賽', 420), data: bytes, parserVersion: 'v1' };
    const r = await refreshEvents([s], 'v2', async () => {
      throw new Error('格式不符');
    });
    expect(r).toEqual({ events: [s], updated: [], stale: ['週三賽'] });
  });
});
