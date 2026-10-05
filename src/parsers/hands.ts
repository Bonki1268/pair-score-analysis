import type { Hand, ParseWarning, Seat, Vulnerability } from '../model/types';
import type { Grid } from './grid';

const SUIT_CODE: Record<string, keyof Hand> = { 'ª': 'S', '©': 'H', '¨': 'D', '§': 'C', '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };

export interface RawDeal {
  /** 最近一個「==> R3」標題的輪次；沒有標題時為 0 */
  round: number;
  board: number;
  hands: Record<Seat, Hand>;
}

export function standardDealer(board: number): Seat {
  return (['N', 'E', 'S', 'W'] as Seat[])[(board - 1) % 4];
}

export function standardVul(board: number): Vulnerability {
  const table: Vulnerability[] = ['None', 'NS', 'EW', 'Both', 'NS', 'EW', 'Both', 'None', 'EW', 'Both', 'None', 'NS', 'Both', 'None', 'NS', 'EW'];
  return table[(board - 1) % 16];
}

/**
 * 讀出工作表中所有四家牌型（隊制賽的 Hands、雙人賽的 個人成績D 版面相同）：
 * 每副牌以「# 牌號」為錨點，北家在錨點右側兩欄（往下 4 列），西家在錨點正下方 4 列，
 * 東家在右側十欄，南家在北家下方 8 列。花色符號代碼 ª © ¨ § 轉回 ♠ ♥ ♦ ♣。
 */
export function readDeals(g: Grid, warnings: ParseWarning[]): RawDeal[] {
  const readHand = (r: number, c: number): Hand | null => {
    const hand: Hand = { S: '', H: '', D: '', C: '' };
    let found = 0;
    for (let i = 0; i < 4; i++) {
      const suit = SUIT_CODE[g.str(r + i, c)];
      if (!suit) continue;
      found++;
      const cards = g.str(r + i, c + 1).toUpperCase().replace(/10/g, 'T');
      hand[suit] = /^[-—–]$/.test(cards) ? '' : cards.replace(/[^AKQJT2-9]/g, '');
    }
    return found === 4 ? hand : null;
  };
  const out: RawDeal[] = [];
  // 「… ==> R3」標題列切開各輪；同一個牌號在不同輪可能重複使用
  let round = 0;
  for (let r = 0; r < g.rowCount; r++) {
    for (const { v } of g.cells(r)) {
      const m = typeof v === 'string' ? /==>\s*R(\d+)/.exec(v) : null;
      if (m) round = Number(m[1]);
    }
    for (const { c, v } of g.cells(r)) {
      if (v !== '#') continue;
      const board = g.num(r, c + 1);
      if (board === null) continue;
      const n = readHand(r, c + 2);
      const w = readHand(r + 4, c);
      const e = readHand(r + 4, c + 10);
      const s = readHand(r + 8, c + 2);
      if (!n || !w || !e || !s) {
        warnings.push({ sheet: g.name, cell: g.ref(r, c), raw: `#${board}`, reason: '牌型不完整' });
        continue;
      }
      out.push({ round, board, hands: { N: n, E: e, S: s, W: w } });
    }
  }
  return out;
}
