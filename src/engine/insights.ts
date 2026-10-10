import defaults from '../config/thresholds.json';
import type { CategoryStat } from './classify';
import type { TrickStat } from './trick-diff';

export type Thresholds = typeof defaults;

export interface Insight {
  kind: 'weak' | 'strong' | 'declare-weak' | 'defend-weak' | 'overbid';
  text: string;
  /** 支撐這句話的數字 */
  evidence: string;
}

export interface InsightInput {
  boards: number;
  categories: CategoryStat[];
  declare: TrickStat;
  defend: TrickStat;
  overbidCount: number;
  /** 我方主打的副數，超叫比例的分母 */
  declared: number;
}

const fmt = (x: number, digits = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(digits);

/** 架構書第 5.4 節的結論規則；不使用生成式 AI，每句話都對應到數字 */
export function generateInsights(input: InsightInput, t: Thresholds = defaults): { insights: Insight[]; lowSample: boolean; headline: string } {
  const out: Insight[] = [];
  // 做莊與防守的 Butler 會被全場叫牌拉動（對手叫到成局時防守方必然負分），只用墩差評估；
  // 強項／弱項規則只套用在叫牌面的類別
  const bidding = new Set(['competitive', 'game-slam', 'strain', 'level']);
  const cats = input.categories.filter((c) => bidding.has(c.id) && c.boards >= t.categoryMinBoards);

  const weak = cats.filter((c) => c.perBoard <= t.weakCategoryImpPerBoard).sort((a, b) => a.perBoard - b.perBoard);
  for (const c of weak) {
    out.push({ kind: 'weak', text: `主要失分在${c.label}`, evidence: `${c.boards} 副，每副 ${fmt(c.perBoard, 2)} IMP` });
  }
  const strong = cats.filter((c) => c.perBoard >= t.strongCategoryImpPerBoard).sort((a, b) => b.perBoard - a.perBoard);
  for (const c of strong) {
    out.push({ kind: 'strong', text: `${c.label}是得分來源`, evidence: `${c.boards} 副，每副 ${fmt(c.perBoard, 2)} IMP` });
  }
  if (input.declare.count >= t.trickDiffMinBoards && input.declare.mean <= t.trickDiffWeak) {
    out.push({ kind: 'declare-weak', text: '做莊可能比場上弱', evidence: `比較 ${input.declare.count} 副，平均 ${fmt(input.declare.mean, 2)} 墩` });
  }
  if (input.defend.count >= t.trickDiffMinBoards && input.defend.mean <= t.trickDiffWeak) {
    out.push({ kind: 'defend-weak', text: '防守可能比場上弱', evidence: `比較 ${input.defend.count} 副，平均 ${fmt(input.defend.mean, 2)} 墩` });
  }
  // 只有我方主打的牌才可能超叫，比例以主打副數為分母
  if (input.declared >= t.overbidMinDeclared && input.overbidCount / input.declared >= t.overbidRate) {
    out.push({
      kind: 'overbid',
      text: '常超叫，宕多墩',
      evidence: `主打 ${input.declared} 副中宕 ${t.overbidDownTricks} 墩以上 ${input.overbidCount} 次，占 ${((input.overbidCount / input.declared) * 100).toFixed(0)}%`,
    });
  }

  const lowSample = input.boards < t.minSampleBoards;
  return { insights: out, lowSample, headline: headline(out, input, t) + (lowSample ? '（樣本不足，僅供參考）' : '') };
}

function headline(insights: Insight[], input: InsightInput, t: Thresholds): string {
  const weak = insights.find((i) => i.kind === 'weak');
  const strong = insights.find((i) => i.kind === 'strong');
  const declareOk = input.declare.count >= t.trickDiffMinBoards && input.declare.mean > t.trickDiffWeak;
  const parts: string[] = [];
  if (declareOk && !insights.some((i) => i.kind === 'declare-weak')) parts.push('做莊穩定');
  if (strong) parts.push(strong.text);
  if (weak) parts.push(weak.text);
  if (insights.some((i) => i.kind === 'declare-weak')) parts.push('做莊可能比場上弱');
  if (insights.some((i) => i.kind === 'defend-weak')) parts.push('防守可能比場上弱');
  if (insights.some((i) => i.kind === 'overbid')) parts.push('常超叫');
  if (parts.length === 0) return '各面向沒有明顯的強弱項';
  return parts.join('，');
}
