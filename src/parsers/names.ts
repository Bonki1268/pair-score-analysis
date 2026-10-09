import type { Pair } from '../model/types';

/** 去掉所有空白，用來比對標籤與人名 */
export function norm(s: string): string {
  return s.replace(/\s+/g, '');
}

/**
 * 把「王小明 陳大華」拆成兩個人名。
 * 先用隊伍名單找出「左右兩半都是隊員」的切點（英文名本身可能含空白，甚至含兩個連續空白）；
 * 找不到時，中文名以空白切開，英文名以兩個以上空白切開。
 */
export function splitPair(s: string, roster: string[] = []): { pair: Pair; confident: boolean } {
  const text = s.trim();
  const known = new Map(roster.map((n) => [norm(n), n.trim()]));
  if (known.size > 0) {
    const re = /\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const left = text.slice(0, m.index);
      const right = text.slice(m.index + m[0].length);
      const l = known.get(norm(left));
      const r = known.get(norm(right));
      if (l && r) return { pair: [l, r], confident: true };
    }
  }
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 2) return { pair: [tokens[0], tokens[1]], confident: true };
  const wide = text.split(/\s{2,}/).filter(Boolean);
  if (wide.length === 2) return { pair: [wide[0], wide[1]], confident: true };
  if (tokens.length < 2) return { pair: [text, ''], confident: false };
  const mid = Math.ceil(tokens.length / 2);
  return { pair: [tokens.slice(0, mid).join(' '), tokens.slice(mid).join(' ')], confident: false };
}

export function pairKey(p: Pair): string {
  return [...p].sort().join(' / ');
}
