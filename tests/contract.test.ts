import { describe, expect, test } from 'vitest';
import { contractScore, formatContract, parseContract } from '../src/parsers/contract';

describe('parseContract', () => {
  test.each([
    ['3SS4', { level: 3, strain: 'S', doubled: 0, declarer: 'S', tricks: 10, overtricks: 1 }],
    ['4HXS-3', { level: 4, strain: 'H', doubled: 1, declarer: 'S', tricks: 7, overtricks: -3 }],
    ['2NXXW2', { level: 2, strain: 'N', doubled: 2, declarer: 'W', tricks: 8, overtricks: 0 }],
    ['1NN3', { level: 1, strain: 'N', doubled: 0, declarer: 'N', tricks: 9, overtricks: 2 }],
    ['7CE7', { level: 7, strain: 'C', doubled: 0, declarer: 'E', tricks: 13, overtricks: 0 }],
    ['2NS-5', { level: 2, strain: 'N', doubled: 0, declarer: 'S', tricks: 3, overtricks: -5 }],
    ['P', { level: 0, strain: null, doubled: 0, declarer: null, tricks: 0, overtricks: 0 }],
    ['Pass', { level: 0, strain: null, declarer: null }],
  ])('%s', (raw, want) => {
    const r = parseContract(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contract).toMatchObject(want);
  });

  test('調整分', () => {
    const r = parseContract('A');
    expect(r.ok && r.contract.adjusted).toBe(true);
  });

  test.each(['', '8SS8', '3SS2', '3ZS4', '3SS0', '7NN-14', 'hello'])('無法解析：%s', (raw) => {
    expect(parseContract(raw).ok).toBe(false);
  });
});

test('formatContract', () => {
  const f = (s: string) => {
    const r = parseContract(s);
    if (!r.ok) throw new Error();
    return formatContract(r.contract);
  };
  expect(f('4HS-2')).toBe('4♥ S −2');
  expect(f('3NN4')).toBe('3NT N +1');
  expect(f('4SXE4')).toBe('4♠X E =');
  expect(f('P')).toBe('Pass');
});

test('contractScore 與成績表一致', () => {
  const s = (raw: string, vul: boolean) => {
    const r = parseContract(raw);
    if (!r.ok) throw new Error();
    return contractScore(r.contract, vul);
  };
  expect(s('3SS4', false)).toBe(170);
  expect(s('4HS4', true)).toBe(620);
  expect(s('2NS-5', true)).toBe(-500);
  expect(s('4HXS-3', true)).toBe(-800);
  expect(s('6SW6', true)).toBe(1430);
  expect(s('1NN1', false)).toBe(90);
  expect(s('4SXE4', false)).toBe(590);
});
