import { describe, expect, test } from 'vitest';
import { matchScore, search } from '../src/index/players';
import { splitPair } from '../src/parsers/names';

describe('splitPair', () => {
  test('中文名以空白切開', () => expect(splitPair('王小明 陳大華').pair).toEqual(['王小明', '陳大華']));
  test('依隊伍名單切開含空白的英文名', () => {
    // 虛構的名字；真實成績表中有本身含兩個空白的英文名
    const roster = ['Anna Maria Lee', 'Bob Chen', 'Carl Otto Berg', 'D  SMITH'];
    expect(splitPair('D  SMITH Carl Otto Berg', roster)).toEqual({ pair: ['D  SMITH', 'Carl Otto Berg'], confident: true });
    expect(splitPair('Bob Chen Anna Maria Lee', roster).pair).toEqual(['Bob Chen', 'Anna Maria Lee']);
  });
  test('沒有名單時英文名以兩個以上空白切開', () => expect(splitPair('John Smith  Mary Jane').pair).toEqual(['John Smith', 'Mary Jane']));
  test('無法確定時標記', () => expect(splitPair('A B C').confident).toBe(false));
});

describe('搜尋', () => {
  test('完全 > 前綴 > 字元重疊', () => {
    expect(matchScore('王小明', '王小明')).toBe(3);
    expect(matchScore('王小', '王小明')).toBeGreaterThan(2);
    expect(matchScore('小明', '王小明')).toBeGreaterThan(1);
    expect(matchScore('明王', '王小明')).toBeGreaterThan(0);
    expect(matchScore('陳', '王小明')).toBe(0);
  });
  test('同一賽事出現在兩隊時標記為需要選隊伍', () => {
    const e = (eventId: string, teamNo: number) => ({ name: '林一一', eventId, eventName: eventId, teamNo, teamName: `T${teamNo}`, boards: 8 });
    const index = new Map([['林一一', [e('A', 1), e('A', 2)]], ['林一二', [e('A', 3), e('B', 3)]]]);
    const r = search(index, '林一');
    expect(r.find((c) => c.name === '林一一')!.ambiguous).toBe(true);
    expect(r.find((c) => c.name === '林一二')!.ambiguous).toBe(false);
  });
});
