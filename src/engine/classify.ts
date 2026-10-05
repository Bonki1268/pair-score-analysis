import type { BoardResult, Contract, Side, Strain } from '../model/types';
import { sideOf } from '../model/types';
import thresholds from '../config/thresholds.json';
import { boardKey } from './butler';
import type { PlayerBoard } from './player-boards';
import { sum } from './player-boards';

export type Category = 'competitive' | 'declarer' | 'defense' | 'game-slam' | 'strain' | 'level' | 'adjusted';

/** 六類輸贏分類（調整分另計，不屬於任何一類） */
export const CATEGORIES: { id: Exclude<Category, 'adjusted'>; label: string; facet: string; hint: string }[] = [
  { id: 'competitive', label: '競叫', facet: '競叫', hint: '主打方和主流不同：搶到或讓出合約' },
  { id: 'game-slam', label: '成局／滿貫判斷', facet: '叫牌', hint: '同一方主打，但成局或滿貫與否和主流不同' },
  { id: 'strain', label: '選擇王牌', facet: '叫牌', hint: '同一方、同一層級，但王牌花色或無王不同' },
  { id: 'level', label: '叫牌高度', facet: '叫牌', hint: '同一方、同花色，部分合約或成局的階數不同' },
  { id: 'declarer', label: '做莊', facet: '做莊', hint: '和主流同合約，由我方主打' },
  { id: 'defense', label: '防守', facet: '防守', hint: '和主流同合約，由對方主打' },
];

export function categoryLabel(c: Category): string {
  return c === 'adjusted' ? '調整分' : CATEGORIES.find((x) => x.id === c)!.label;
}

interface ContractKey {
  key: string;
  side: Side | null;
  level: number;
  strain: Strain | null;
}

function contractKey(c: Contract): ContractKey {
  if (c.level === 0 || !c.declarer || !c.strain) return { key: 'PASS', side: null, level: 0, strain: null };
  const side = sideOf(c.declarer);
  return { key: `${side}|${c.level}|${c.strain}`, side, level: c.level, strain: c.strain };
}

/** 主流合約：全場最多桌次打的「主打方 + 階數 + 花色」；同數時取鍵值字典序最小者，確保結果固定 */
export function mainstreamContract(field: BoardResult[]): ContractKey & { count: number } {
  const counts = new Map<string, { k: ContractKey; n: number }>();
  for (const r of field) {
    if (r.contract.adjusted) continue;
    const k = contractKey(r.contract);
    const e = counts.get(k.key) ?? { k, n: 0 };
    e.n++;
    counts.set(k.key, e);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n || a.k.key.localeCompare(b.k.key))[0];
  return best ? { ...best.k, count: best.n } : { key: 'PASS', side: null, level: 0, strain: null, count: 0 };
}

/** 獎分層級：0 Pass、1 部分合約、2 成局、3 小滿貫、4 大滿貫 */
export function bonusTier(level: number, strain: Strain | null): number {
  if (level === 0 || !strain) return 0;
  if (level === 7) return 4;
  if (level === 6) return 3;
  const trickScore = level * (strain === 'C' || strain === 'D' ? 20 : 30) + (strain === 'N' ? 10 : 0);
  return trickScore >= 100 ? 2 : 1;
}

/**
 * 依序判斷：
 * 1. 主打方和主流不同（含一邊 Pass）→ 競叫
 * 2. 階數與花色都和主流相同 → 我方主打為「做莊」，對方主打為「防守」
 * 3. 獎分層級不同 → 成局／滿貫判斷
 * 4. 花色不同 → 選擇王牌；否則 → 叫牌高度
 */
export function classifyBoard(pb: PlayerBoard, field: BoardResult[]): { category: Category; mainstream: string; overbid: boolean } {
  const main = mainstreamContract(field);
  const c = pb.result.contract;
  const overbid = pb.role === 'declare' && c.overtricks <= -thresholds.overbidDownTricks;
  if (c.adjusted) return { category: 'adjusted', mainstream: main.key, overbid: false };
  const mine = contractKey(c);
  let category: Category;
  if (mine.side !== main.side) category = 'competitive';
  else if (mine.level === main.level && mine.strain === main.strain) category = pb.role === 'declare' ? 'declarer' : 'defense';
  else if (bonusTier(mine.level, mine.strain) !== bonusTier(main.level, main.strain)) category = 'game-slam';
  else if (mine.strain !== main.strain) category = 'strain';
  else category = 'level';
  return { category, mainstream: main.key, overbid };
}

export interface CategoryStat {
  id: Category;
  label: string;
  boards: number;
  imp: number;
  perBoard: number;
}

export interface Classified {
  pb: PlayerBoard;
  category: Category;
  mainstream: string;
  overbid: boolean;
}

export function classifyAll(boards: PlayerBoard[], byBoard: Map<string, BoardResult[]>): Classified[] {
  return boards.map((pb) => ({ pb, ...classifyBoard(pb, byBoard.get(boardKey(pb.result)) ?? []) }));
}

export function categoryStats(items: Classified[]): CategoryStat[] {
  const ids: Category[] = [...CATEGORIES.map((c) => c.id), 'adjusted'];
  return ids
    .map((id) => {
      const xs = items.filter((i) => i.category === id);
      const imp = sum(xs.map((x) => x.pb.butler));
      return { id, label: categoryLabel(id), boards: xs.length, imp, perBoard: xs.length ? imp / xs.length : 0 };
    })
    .filter((s) => s.id !== 'adjusted' || s.boards > 0);
}

/** 主流合約鍵值轉成顯示文字，例如 `NS|4|H` → `南北 4♥` */
export function formatMainstream(key: string): string {
  if (key === 'PASS') return 'Pass';
  const [side, level, strain] = key.split('|');
  const sym: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣', N: 'NT' };
  return `${side === 'NS' ? '南北' : '東西'} ${level}${sym[strain]}`;
}
