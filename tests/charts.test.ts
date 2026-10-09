// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { divergingBars, fitText } from '../src/ui/charts';

describe('長條圖文字', () => {
  test('放得下時不截斷', () => {
    expect(fitText('成局／滿貫判斷', 124, 12)).toBe('成局／滿貫判斷');
  });
  test('太長時截斷並加上「…」', () => {
    const s = fitText('國立臺灣大學橋藝社第一隊（主力）', 124, 10);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThan('國立臺灣大學橋藝社第一隊（主力）'.length);
  });
  test('標籤與附註分兩行，完整文字留在提示', () => {
    const note = '國立臺灣大學橋藝社第一隊（主力）';
    const el = document.createElement('div');
    el.innerHTML = divergingBars([{ label: '學生組 乙組 R3', value: -5, note }]);
    const label = el.querySelector('.bar-label')!;
    const n = el.querySelector('.bar-note')!;
    expect(n.getAttribute('x')).toBe('0');
    expect(Number(n.getAttribute('y'))).toBeGreaterThan(Number(label.getAttribute('y')));
    expect(el.querySelector('title')!.textContent).toContain(note);
  });
});
