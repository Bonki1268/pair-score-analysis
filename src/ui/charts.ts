import { esc, signed } from './format';

export interface Bar {
  label: string;
  value: number;
  note?: string;
  /** 中性色（不分正負），用於不屬於技術類別的列 */
  neutral?: boolean;
}

const LABEL_PX = 12;
const NOTE_PX = 10;

/** 估計文字寬度：中日韓與全形字約 1 個字高，其他字元約 0.6 個字高 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += /[⺀-￯]/.test(ch) ? px : px * 0.6;
  return w;
}

/** 超過寬度時截斷並加上「…」；完整文字放在每列的 title 提示 */
export function fitText(s: string, maxW: number, px: number): string {
  if (textWidth(s, px) <= maxW) return s;
  let out = '';
  for (const ch of s) {
    if (textWidth(out + ch + '…', px) > maxW) break;
    out += ch;
  }
  return out + '…';
}

/**
 * 以 0 為中心的橫向長條圖（自繪 SVG）。
 * 左欄上行是標籤、下行是附註，兩行分開放，避免長標籤和附註重疊。
 */
export function divergingBars(bars: Bar[], opts: { unit?: string } = {}): string {
  const hasNote = bars.some((b) => b.note);
  const rowH = hasNote ? 36 : 30;
  const labelW = 132;
  const valueW = 48;
  const width = 360;
  const plotW = width - labelW - valueW;
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  const mid = labelW + plotW / 2;
  const scale = plotW / 2 / max;
  const height = bars.length * rowH + 8;
  const textW = labelW - 8;
  const rows = bars
    .map((b, i) => {
      const y = 4 + i * rowH;
      const center = y + rowH / 2;
      const w = Math.abs(b.value) * scale;
      const x = b.value >= 0 ? mid : mid - w;
      const cls = b.neutral ? 'bar-neutral' : b.value > 0 ? 'bar-pos' : b.value < 0 ? 'bar-neg' : 'bar-zero';
      const labelY = b.note ? center - 6 : center;
      return `
        <g>
          <title>${esc(b.label)}：${signed(b.value)}${opts.unit ?? ''}${b.note ? `（${esc(b.note)}）` : ''}</title>
          <text x="0" y="${labelY}" class="bar-label" dominant-baseline="middle">${esc(fitText(b.label, textW, LABEL_PX))}</text>
          ${b.note ? `<text x="0" y="${center + 8}" class="bar-note" dominant-baseline="middle">${esc(fitText(b.note, textW, NOTE_PX))}</text>` : ''}
          <rect x="${x}" y="${y + 8}" width="${Math.max(w, 1)}" height="${rowH - 16}" rx="3" class="${cls}" />
          <text x="${width}" y="${center}" class="bar-value" text-anchor="end" dominant-baseline="middle">${signed(b.value)}</text>
        </g>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="長條圖">
    <line x1="${mid}" x2="${mid}" y1="0" y2="${height}" class="axis" />
    ${rows}
  </svg>`;
}
