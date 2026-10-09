import { describe, expect, test } from 'vitest';
import { placeEvent } from '../src/model/event-id';
import type { ParsedEvent } from '../src/model/types';
import { playerBoards } from '../src/engine/player-boards';
import { br } from './fixtures';

function ev(title: string, fileName: string, nsScore = 420): ParsedEvent {
  return {
    event: { eventId: title, name: title, kind: 'pairs', scoring: 'butler', division: '', rounds: 1, boardsPerRound: 1, fileName, importedAt: '' },
    teams: [{ eventId: title, teamNo: 1, name: '甲', finalVp: 0, rank: 1, roster: [] }],
    matches: [],
    results: [br('4HS4', { eventId: title, table: 1, matchId: `${title}|R1|1v2`, nsScore })],
    deals: [],
    warnings: [],
    sheetPairButler: [],
  };
}

describe('同標題的賽事', () => {
  test('沒有同標題時照原樣保存', () => {
    const p = placeEvent([ev('週三賽', 'a.xls')], ev('週四賽', 'b.xls'));
    expect(p).toMatchObject({ replaces: null, note: null });
    expect(p.event.event.eventId).toBe('週四賽');
  });

  test('同檔名重新上傳 → 取代原本那份', () => {
    const p = placeEvent([ev('週三賽', 'a.xls')], ev('週三賽', 'a.xls', 450));
    expect(p).toMatchObject({ replaces: '週三賽', note: null });
  });

  test('改了檔名但內容相同 → 取代原本那份', () => {
    const p = placeEvent([ev('週三賽', 'a.xls')], ev('週三賽', 'a (1).xls'));
    expect(p.replaces).toBe('週三賽');
  });

  test('同標題、不同檔名與內容 → 分開保存，ID 與各筆資料一起改名', () => {
    const existing = [ev('週三賽', '0930.xls')];
    const p = placeEvent(existing, ev('週三賽', '1007.xls', 450));
    expect(p.replaces).toBeNull();
    expect(p.note).toContain('已分開保存');
    const e = p.event;
    expect(e.event.eventId).toBe('週三賽（1007）');
    expect(e.event.name).toBe('週三賽（1007）');
    expect(e.event.title).toBe('週三賽');
    expect(e.teams[0].eventId).toBe(e.event.eventId);
    expect(e.results[0].eventId).toBe(e.event.eventId);
    expect(e.results[0].matchId).toBe('週三賽（1007）|R1|1v2');

    // 分開保存的那份再次上傳時，取代它而不是第一份
    const again = placeEvent([...existing, e], ev('週三賽', '1007.xls', 460));
    expect(again.replaces).toBe('週三賽（1007）');
    expect(again.event.event.eventId).toBe('週三賽（1007）');
  });
});

describe('隊伍篩選只限制所屬賽事', () => {
  const rs = [
    br('4HS4', { eventId: 'A', nsTeam: 1, nsPair: ['我', '甲'] }),
    br('4HS4', { eventId: 'A', nsTeam: 2, nsPair: ['我', '乙'] }),
    br('4HS4', { eventId: 'B', nsTeam: 5, nsPair: ['我', '丙'] }),
  ];
  test('賽事 A 選第 1 隊時，賽事 B 照常列入', () => {
    expect(playerBoards(rs, '我', { teams: ['A#1'] }).map((b) => b.partner)).toEqual(['甲', '丙']);
  });
  test('換到賽事 B 時不會因為 A 的隊伍篩選而變成空的', () => {
    expect(playerBoards(rs, '我', { eventIds: ['B'], teams: ['A#1'] }).map((b) => b.partner)).toEqual(['丙']);
  });
});
