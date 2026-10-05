import type { Contract } from '../model/types';
import { formatContract } from '../parsers/contract';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 帶正負號的數字；負號用全形減號 */
export function signed(x: number, digits = 0): string {
  const v = Number(x.toFixed(digits));
  if (v === 0) return (0).toFixed(digits);
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(digits);
}

export function signClass(x: number): string {
  return x > 0 ? 'pos' : x < 0 ? 'neg' : '';
}

/** 花色符號加上顏色：紅色花色用紅字 */
export function suitHtml(text: string): string {
  return esc(text).replace(/[♥♦]/g, (s) => `<span class="suit-red">${s}</span>`).replace(/[♠♣]/g, (s) => `<span class="suit-black">${s}</span>`);
}

export function contractHtml(c: Contract): string {
  return suitHtml(formatContract(c));
}

export function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}
