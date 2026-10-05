import type { BoardResult, Contract, Side, Strain } from '../model/types';
import { sideOf } from '../model/types';
import thresholds from '../config/thresholds.json';
import { boardKey } from './butler';
import type { PlayerBoard } from './player-boards';
import { sum } from './player-boards';

export type Category = 'competitive' | 'declarer' | 'defense' | 'game-slam' | 'strain' | 'level' | 'passed-out' | 'no-consensus' | 'adjusted';
type TechCategory = 'competitive' | 'declarer' | 'defense' | 'game-slam' | 'strain' | 'level';

/**
 * 主流合約平手時的處理：
 * - separate：選不同候選會得到不同類別的牌歸入「全場無共識」；自己與主流都 Pass 歸入「Pass 局」
 * - lowest：舊行為，平手取鍵值字典序最小者，Pass 的牌依角色歸入做莊／防守
 */
export type TiePolicy = 'separate' | 'lowest';
export const DEFAULT_TIE_POLICY = thresholds.tiePolicy as TiePolicy;

/** 六類輸贏分類（調整分另計，不屬於任何一類） */
export const CATEGORIES: { id: TechCategory; label: string; facet: string; hint: string }[] = [
  { id: 'competitive', label: '競叫', facet: '競叫', hint: '主打方和主流不同：搶到或讓出合約' },
  { id: 'game-slam', label: '成局／滿貫判斷', facet: '叫牌', hint: '同一方主打，但成局或滿貫與否和主流不同' },
  { id: 'strain', label: '選擇王牌', facet: '叫牌', hint: '同一方、同一層級，但王牌花色或無王不同' },
  { id: 'level', label: '叫牌高度', facet: '叫牌', hint: '同一方、同花色，部分合約或成局的階數不同' },
  { id: 'declarer', label: '做莊', facet: '做莊', hint: '和主流同合約，由我方主打' },
  { id: 'defense', label: '防守', facet: '防守', hint: '和主流同合約，由對方主打' },
];

/** 不屬於技術類別的牌：不計入強弱項，報告中以中性色呈現 */
export const EXTRA_CATEGORIES: { id: Exclude<Category, TechCategory>; label: string; hint: string }[] = [
  { id: 'passed-out', label: 'Pass 局', hint: '自己和主流都是四家 Pass' },
  { id: 'adjusted', label: '調整分', hint: '裁判判給的調整分' },
  { id: 'no-consensus', label: '全場無共識', hint: '主流合約平手的牌，全場對打法沒有共識，不計入技術類別' },
];

export function categoryLabel(c: Category): string {
  return [...CATEGORIES, ...EXTRA_CATEGORIES].find((x) => x.id === c)!.label;
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

export type MainstreamCount = ContractKey & { count: number };

/** 全場每種「主打方 + 階數 + 花色」的桌數（Pass 自成一種），依桌數由多到少、同數時依鍵值字典序；調整分不列入 */
export function contractCounts(field: BoardResult[]): MainstreamCount[] {
  const counts = new Map<string, { k: ContractKey; n: number }>();
  for (const r of field) {
    if (r.contract.adjusted) continue;
    const k = contractKey(r.contract);
    const e = counts.get(k.key) ?? { k, n: 0 };
    e.n++;
    counts.set(k.key, e);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.k.key.localeCompare(b.k.key)).map((e) => ({ ...e.k, count: e.n }));
}

/** 桌數最多的所有候選；超過一個即為平手 */
export function mainstreamCandidates(field: BoardResult[]): MainstreamCount[] {
  const all = contractCounts(field);
  return all.filter((c) => c.count === all[0].count);
}

/** 主流合約：全場最多桌次打的「主打方 + 階數 + 花色」；同數時取鍵值字典序最小者，確保結果固定 */
export function mainstreamContract(field: BoardResult[]): MainstreamCount {
  return contractCounts(field)[0] ?? { key: 'PASS', side: null, level: 0, strain: null, count: 0 };
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
 * 和單一主流合約比較，依序判斷：
 * 1. 主打方和主流不同（含一邊 Pass）→ 競叫
 * 2. 階數與花色都和主流相同 → 我方主打為「做莊」，對方主打為「防守」
 * 3. 獎分層級不同 → 成局／滿貫判斷
 * 4. 花色不同 → 選擇王牌；否則 → 叫牌高度
 */
function techCategory(pb: PlayerBoard, mine: ContractKey, main: ContractKey): TechCategory {
  if (mine.side !== main.side) return 'competitive';
  if (mine.level === main.level && mine.strain === main.strain) return pb.role === 'declare' ? 'declarer' : 'defense';
  if (bonusTier(mine.level, mine.strain) !== bonusTier(main.level, main.strain)) return 'game-slam';
  if (mine.strain !== main.strain) return 'strain';
  return 'level';
}

export interface Classification {
  category: Category;
  mainstream: string;
  /** 歸入「全場無共識」時，平手的所有候選與桌數；其餘為空 */
  tied: { key: string; count: number }[];
  overbid: boolean;
}

/**
 * separate（預設）：先和每個主流候選比較；
 * - 自己與主流都是 Pass → Pass 局
 * - 平手且不同候選得到不同類別 → 全場無共識；所有候選得到同一類別則照常歸類
 * lowest：只和字典序最小的候選比較（舊行為）
 */
export function classifyBoard(pb: PlayerBoard, field: BoardResult[], tiePolicy: TiePolicy = DEFAULT_TIE_POLICY): Classification {
  const candidates = mainstreamCandidates(field);
  const main = candidates[0] ?? mainstreamContract(field);
  const c = pb.result.contract;
  const overbid = pb.role === 'declare' && c.overtricks <= -thresholds.overbidDownTricks;
  if (c.adjusted) return { category: 'adjusted', mainstream: main.key, tied: [], overbid: false };
  const mine = contractKey(c);
  if (tiePolicy === 'lowest') return { category: techCategory(pb, mine, main), mainstream: main.key, tied: [], overbid };

  const cats = new Set<Category>(candidates.map((m) => (mine.key === 'PASS' && m.key === 'PASS' ? 'passed-out' : techCategory(pb, mine, m))));
  const category: Category = cats.size > 1 ? 'no-consensus' : [...cats][0] ?? techCategory(pb, mine, main);
  const tied = category === 'no-consensus' ? candidates.map((m) => ({ key: m.key, count: m.count })) : [];
  return { category, mainstream: main.key, tied, overbid };
}

export interface CategoryStat {
  id: Category;
  label: string;
  boards: number;
  imp: number;
  perBoard: number;
}

export interface Classified extends Classification {
  pb: PlayerBoard;
}

export function classifyAll(boards: PlayerBoard[], byBoard: Map<string, BoardResult[]>, tiePolicy: TiePolicy = DEFAULT_TIE_POLICY): Classified[] {
  return boards.map((pb) => ({ pb, ...classifyBoard(pb, byBoard.get(boardKey(pb.result)) ?? [], tiePolicy) }));
}

export function categoryStats(items: Classified[]): CategoryStat[] {
  const ids: Category[] = [...CATEGORIES.map((c) => c.id), ...EXTRA_CATEGORIES.map((c) => c.id)];
  return ids
    .map((id) => {
      const xs = items.filter((i) => i.category === id);
      const imp = sum(xs.map((x) => x.pb.butler));
      return { id, label: categoryLabel(id), boards: xs.length, imp, perBoard: xs.length ? imp / xs.length : 0 };
    })
    // 非技術類別只在有牌時列出；「全場無共識」排在最後
    .filter((s) => CATEGORIES.some((c) => c.id === s.id) || s.boards > 0);
}

/** 平手候選的顯示文字，例如 `南北 2♥／南北 4♥ 各 5 桌` */
export function formatTied(tied: { key: string; count: number }[]): string {
  return `${tied.map((t) => formatMainstream(t.key)).join('／')} 各 ${tied[0]?.count ?? 0} 桌`;
}

/** 主流合約鍵值轉成顯示文字，例如 `NS|4|H` → `南北 4♥` */
export function formatMainstream(key: string): string {
  if (key === 'PASS') return 'Pass';
  const [side, level, strain] = key.split('|');
  const sym: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣', N: 'NT' };
  return `${side === 'NS' ? '南北' : '東西'} ${level}${sym[strain]}`;
}
