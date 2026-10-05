import type { Contract, Seat, Strain } from '../model/types';

const CONTRACT_RE = /^([1-7])([CDHSN])(XX|X)?([NESW])(-?\d{1,2})$/;
const PASS_RE = /^(P|PASS|AP|ALL ?PASS)$/;
const ADJUSTED_RE = /^(A|AVG|AVERAGE)[+-]?$/;

export type ContractParse = { ok: true; contract: Contract } | { ok: false; reason: string };

/**
 * 解析成績表的合約字串，例如 `4HXS-3`、`3NN4`、`P`。
 * 結果為正數時是「扣掉 6 墩底後實際拿到的墩數」，負數是宕墩。
 */
export function parseContract(input: unknown): ContractParse {
  const raw = String(input ?? '').trim();
  const s = raw.toUpperCase().replace(/\s+/g, '');
  if (!s) return { ok: false, reason: '空白合約' };
  if (PASS_RE.test(s)) {
    return {
      ok: true,
      contract: { raw, level: 0, strain: null, doubled: 0, declarer: null, tricks: 0, overtricks: 0 },
    };
  }
  if (ADJUSTED_RE.test(s)) {
    return {
      ok: true,
      contract: { raw, level: 0, strain: null, doubled: 0, declarer: null, tricks: 0, overtricks: 0, adjusted: true },
    };
  }
  const m = CONTRACT_RE.exec(s);
  if (!m) return { ok: false, reason: '無法辨識的合約格式' };
  const level = Number(m[1]);
  const strain = m[2] as Strain;
  const doubled = m[3] === 'XX' ? 2 : m[3] === 'X' ? 1 : 0;
  const declarer = m[4] as Seat;
  const result = Number(m[5]);
  if (result === 0) return { ok: false, reason: '結果不可為 0' };
  if (result > 0 && result < level) return { ok: false, reason: '墩數少於合約階數卻不是宕墩' };
  const tricks = result > 0 ? 6 + result : 6 + level + result;
  if (tricks < 0 || tricks > 13) return { ok: false, reason: '墩數超出 0–13' };
  return {
    ok: true,
    contract: { raw, level, strain, doubled, declarer, tricks, overtricks: tricks - 6 - level },
  };
}

const SUIT_SYMBOL: Record<Strain, string> = { S: '♠', H: '♥', D: '♦', C: '♣', N: 'NT' };

export function strainSymbol(strain: Strain): string {
  return SUIT_SYMBOL[strain];
}

/** 以「4♥ S −2」的形式顯示合約 */
export function formatContract(c: Contract): string {
  if (c.adjusted) return '調整分';
  if (c.level === 0 || !c.strain || !c.declarer) return 'Pass';
  const dbl = c.doubled === 2 ? 'XX' : c.doubled === 1 ? 'X' : '';
  const res = c.overtricks === 0 ? '=' : c.overtricks > 0 ? `+${c.overtricks}` : `−${-c.overtricks}`;
  return `${c.level}${SUIT_SYMBOL[c.strain]}${dbl} ${c.declarer} ${res}`;
}

/** 依合約與身價計算主打方得分（複式橋牌計分） */
export function contractScore(c: Contract, vulnerable: boolean): number {
  if (c.level === 0 || !c.strain) return 0;
  const mult = c.doubled === 2 ? 4 : c.doubled === 1 ? 2 : 1;
  if (c.overtricks < 0) {
    const down = -c.overtricks;
    if (c.doubled === 0) return -(vulnerable ? 100 : 50) * down;
    let pen = 0;
    for (let i = 1; i <= down; i++) {
      if (vulnerable) pen += i === 1 ? 200 : 300;
      else pen += i === 1 ? 100 : i <= 3 ? 200 : 300;
    }
    return -pen * (c.doubled === 2 ? 2 : 1);
  }
  const perTrick = c.strain === 'C' || c.strain === 'D' ? 20 : 30;
  let trickScore = perTrick * c.level + (c.strain === 'N' ? 10 : 0);
  trickScore *= mult;
  let score = trickScore;
  score += trickScore >= 100 ? (vulnerable ? 500 : 300) : 50;
  if (c.level === 6) score += vulnerable ? 750 : 500;
  if (c.level === 7) score += vulnerable ? 1500 : 1000;
  if (c.doubled === 1) score += 50;
  if (c.doubled === 2) score += 100;
  const over = c.overtricks;
  if (c.doubled === 0) score += over * perTrick;
  else score += over * (vulnerable ? 200 : 100) * (c.doubled === 2 ? 2 : 1);
  return score;
}
