import { esc, signed } from './format';

export interface Bar {
  label: string;
  value: number;
  note?: string;
  /** 中性色（不分正負），用於不屬於技術類別的列 */
  neutral?: boolean;
}

/** 以 0 為中心的橫向長條圖（自繪 SVG） */
export function divergingBars(bars: Bar[], opts: { unit?: string } = {}): string {
  const rowH = 30;
  const labelW = 112;
  const valueW = 56;
  const width = 360;
  const plotW = width - labelW - valueW;
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  const mid = labelW + plotW / 2;
  const scale = plotW / 2 / max;
  const height = bars.length * rowH + 8;
  const rows = bars
    .map((b, i) => {
      const y = 4 + i * rowH;
      const w = Math.abs(b.value) * scale;
      const x = b.value >= 0 ? mid : mid - w;
      const cls = b.neutral ? 'bar-neutral' : b.value > 0 ? 'bar-pos' : b.value < 0 ? 'bar-neg' : 'bar-zero';
      return `
        <g>
          <title>${esc(b.label)}：${signed(b.value)}${opts.unit ?? ''}${b.note ? `（${esc(b.note)}）` : ''}</title>
          <text x="0" y="${y + rowH / 2}" class="bar-label" dominant-baseline="middle">${esc(b.label)}</text>
          ${b.note ? `<text x="${labelW - 6}" y="${y + rowH / 2}" class="bar-note" text-anchor="end" dominant-baseline="middle">${esc(b.note)}</text>` : ''}
          <rect x="${x}" y="${y + 6}" width="${Math.max(w, 1)}" height="${rowH - 12}" rx="3" class="${cls}" />
          <text x="${width}" y="${y + rowH / 2}" class="bar-value" text-anchor="end" dominant-baseline="middle">${signed(b.value)}</text>
        </g>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="長條圖">
    <line x1="${mid}" x2="${mid}" y1="0" y2="${height}" class="axis" />
    ${rows}
  </svg>`;
}
