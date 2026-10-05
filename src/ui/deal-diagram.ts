import type { Deal, Hand, Seat } from '../model/types';
import { esc } from './format';

const SUITS: { key: keyof Hand; sym: string; red: boolean }[] = [
  { key: 'S', sym: '♠', red: false },
  { key: 'H', sym: '♥', red: true },
  { key: 'D', sym: '♦', red: true },
  { key: 'C', sym: '♣', red: false },
];

const SEAT_NAME: Record<Seat, string> = { N: '北', E: '東', S: '南', W: '西' };
const VUL_TEXT = { None: '雙方無身價', NS: '南北有身價', EW: '東西有身價', Both: '雙方有身價' };

function hand(h: Hand, seat: Seat, deal: Deal, highlight: Seat[]): string {
  const vul = deal.vulnerability === 'Both' || (deal.vulnerability === 'NS' && 'NS'.includes(seat)) || (deal.vulnerability === 'EW' && 'EW'.includes(seat));
  const lines = SUITS.map(
    (s) => `<div><span class="${s.red ? 'suit-red' : 'suit-black'}">${s.sym}</span> ${esc([...h[s.key]].map((c) => (c === 'T' ? '10' : c)).join(' ')) || '—'}</div>`,
  ).join('');
  return `<div class="hand hand-${seat} ${highlight.includes(seat) ? 'hand-me' : ''}">
    <div class="hand-seat ${vul ? 'vul' : ''}">${SEAT_NAME[seat]}${deal.dealer === seat ? ' · 發牌' : ''}</div>${lines}</div>`;
}

/** 四家牌型圖；highlight 是賽員坐的兩家 */
export function dealDiagram(deal: Deal, highlight: Seat[] = []): string {
  return `<div class="deal">
    ${(['N', 'W', 'E', 'S'] as Seat[]).map((s) => hand(deal.hands[s], s, deal, highlight)).join('')}
    <div class="deal-center">第 ${deal.board} 副<br>${VUL_TEXT[deal.vulnerability]}</div>
  </div>`;
}
