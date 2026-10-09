import type { BoardResult, ParsedEvent } from '../model/types';
import { pairKey } from '../parsers/names';
import { boardKey, butlerOf, computeDatum, crossImp, groupByBoard } from './butler';

/** warn：成績表本身前後不一致，但原因已確認、不影響解析；報告照成績表的數字 */
export type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/**
 * 用成績表自己的數字互相核對，不需要事先知道正確答案。
 * 使用者上傳任何一份新成績表時都會執行，確認解析結果可信。
 */
export function validateEvent(p: ParsedEvent): Check[] {
  if (p.event.kind === 'pairs') {
    return [pairsCountCheck(p), pairTotalsCheck(p), sheetImpCheck(p), pairsDatumCheck(p), dealCheck(p), warningCheck(p)];
  }
  return [countCheck(p), butlerCheck(p), matchImpCheck(p), datumCheck(p), dealCheck(p), warningCheck(p)];
}

// ---------- 隊制賽 ----------

function countCheck(p: ParsedEvent): Check {
  const label = '桌次筆數';
  if (p.teams.length === 0) return { id: 'count', label, status: 'skip', detail: '沒有隊伍資料，無法核對' };
  // 隊數為奇數時有輪空，每輪少一場
  const tablesPerRound = Math.floor(p.teams.length / 2);
  const want = tablesPerRound * 2 * p.event.rounds * p.event.boardsPerRound;
  const got = p.results.length;
  return got === want
    ? { id: 'count', label, status: 'pass', detail: `${got} 筆 = ${tablesPerRound} 桌 × 2 室 × ${p.event.rounds} 輪 × ${p.event.boardsPerRound} 副` }
    : { id: 'count', label, status: 'fail', detail: `解析出 ${got} 筆，預期 ${want} 筆` };
}

/** 每一對的牌數與分數總和；score 決定加總哪一個分數 */
function pairSums(results: BoardResult[], score: (r: BoardResult, side: 'NS' | 'EW') => number) {
  const totals = new Map<string, { boards: number; imp: number }>();
  const add = (pair: [string, string], team: number, imp: number) => {
    const k = `${team}|${pairKey(pair)}`;
    const t = totals.get(k) ?? { boards: 0, imp: 0 };
    t.boards++;
    t.imp += imp;
    totals.set(k, t);
  };
  for (const r of results) {
    add(r.nsPair, r.nsTeam, score(r, 'NS'));
    add(r.ewPair, r.ewTeam, score(r, 'EW'));
  }
  return totals;
}

function compareTotals(p: ParsedEvent, id: string, label: string, totals: Map<string, { boards: number; imp: number }>, unit: string): Check {
  const bad = p.sheetPairButler.filter((s) => {
    const t = totals.get(`${s.teamNo}|${pairKey(s.pair)}`);
    return !t || t.boards !== s.boards || Math.abs(t.imp - s.imp) > 1e-9;
  });
  if (bad.length === 0 && totals.size === p.sheetPairButler.length) {
    return { id, label, status: 'pass', detail: `${totals.size} ${unit}全部一致` };
  }
  const sample = bad.slice(0, 3).map((s) => s.pair.join(' ')).join('、');
  return { id, label, status: 'fail', detail: `${bad.length} ${unit}不一致${sample ? `（例如 ${sample}）` : ''}；系統 ${totals.size} 對，成績表 ${p.sheetPairButler.length} 對` };
}

function butlerCheck(p: ParsedEvent): Check {
  const label = '配對 Butler 與 ButlerP 工作表';
  if (p.sheetPairButler.length === 0) return { id: 'butler', label, status: 'skip', detail: '成績表沒有 ButlerP 工作表' };
  return compareTotals(p, 'butler', label, pairSums(p.results, (r, side) => (side === 'NS' ? r.nsButler : r.ewButler)), '個配對');
}

function matchImpCheck(p: ParsedEvent): Check {
  const label = '逐副 IMP 加總等於對局總 IMP';
  if (p.matches.length === 0) return { id: 'imp', label, status: 'skip', detail: '沒有對局資料' };
  const net = new Map<string, number>();
  for (const r of p.results) if (r.room === 'open') net.set(r.matchId, (net.get(r.matchId) ?? 0) + r.nsImp);
  const bad = p.matches.filter((m) => (net.get(m.matchId) ?? 0) !== m.homeImp - m.awayImp);
  return bad.length === 0
    ? { id: 'imp', label, status: 'pass', detail: `${p.matches.length} 場全部一致` }
    : { id: 'imp', label, status: 'fail', detail: `${bad.length} 場不一致（例如第 ${bad[0].round} 輪第 ${bad[0].table} 桌）` };
}

/** 成績表改了某一桌的成績，但 Datum 與 Butler 仍是用修改前的得分算的 */
export interface StaleCorrection {
  result: BoardResult;
  /** 能同時讓成績表的 Datum 與這一桌 Butler 成立的得分範圍（以 10 分為單位） */
  original: [number, number];
}

/**
 * 找出 Datum 與自算不同、或有桌次 Butler ≠ IMP(得分 − 成績表 Datum) 的牌，並嘗試用「單一桌事後改成績」解釋：
 * 恰好一桌的 Butler 不符，而且存在某個得分能同時重現成績表的 Datum 與該桌 Butler。
 * 修改幅度小時 Datum 截到 10 分後可能不變，只有該桌 Butler 不同，也算在內。
 */
export function datumMismatches(p: ParsedEvent): { stale: StaleCorrection[]; unexplained: BoardResult[][] } {
  const stale: StaleCorrection[] = [];
  const unexplained: BoardResult[][] = [];
  for (const rs of groupByBoard(p.results).values()) {
    const valid = rs.filter((r) => !r.contract.adjusted);
    const off = valid.filter((r) => butlerOf(r.nsScore, r.datum) !== r.nsButler);
    if (off.length === 0 && computeDatum(valid.map((r) => r.nsScore)) === rs[0].datum) continue;
    if (off.length === 1) {
      const r = off[0];
      const others = valid.filter((x) => x !== r).map((x) => x.nsScore);
      const xs: number[] = [];
      for (let x = -8000; x <= 8000; x += 10) if (butlerOf(x, r.datum) === r.nsButler && computeDatum([...others, x]) === r.datum) xs.push(x);
      if (xs.length) {
        stale.push({ result: r, original: [xs[0], xs[xs.length - 1]] });
        continue;
      }
    }
    unexplained.push(rs);
  }
  return { stale, unexplained };
}

const roomLabel = (r: BoardResult) => (r.room === 'open' ? '公開室' : '閉室');
const scoreText = (x: number) => (x > 0 ? `+${x}` : String(x));

function datumCheck(p: ParsedEvent): Check {
  const label = '自算 Datum、Butler 與成績表';
  const groups = [...groupByBoard(p.results).values()];
  if (groups.length === 0) return { id: 'datum', label, status: 'skip', detail: '沒有牌局結果' };
  const { stale, unexplained } = datumMismatches(p);
  if (stale.length === 0 && unexplained.length === 0) return { id: 'datum', label, status: 'pass', detail: `${groups.length} 副全部一致` };
  // Datum 算法因計分軟體而異；不一致不影響報告（報告採用成績表的 Datum），只提示
  if (unexplained.length > 0) {
    return { id: 'datum', label, status: 'fail', detail: `${stale.length + unexplained.length}/${groups.length} 副不一致；報告仍採用成績表的 Datum，可能是計分軟體算法不同` };
  }
  const list = stale
    .map(({ result: r, original: [lo, hi] }) => `R${r.round} 第 ${r.board} 副第 ${r.table} 桌${roomLabel(r)}（現為 ${scoreText(r.nsScore)}，原約 ${lo === hi ? scoreText(lo) : `${scoreText(lo)}～${scoreText(hi)}`}）`)
    .join('、');
  return {
    id: 'datum',
    label,
    status: 'warn',
    detail: `${stale.length}/${groups.length} 副有一桌成績事後被修改，但成績表沒有重算 Datum 與 Butler：${list}。對局 IMP 已依修改後的成績計算；報告沿用成績表公布的 Datum 與 Butler，和 ButlerP 一致`,
  };
}

// ---------- 雙人賽 ----------

const SCORING_LABEL = { butler: 'Butler', 'cross-imp': 'Cross-IMP', 'imp-teams': 'IMP' } as const;

function pairsCountCheck(p: ParsedEvent): Check {
  const label = '桌次筆數';
  if (p.sheetPairButler.length === 0) return { id: 'count', label, status: 'skip', detail: '沒有總成績資料，無法核對' };
  const played = p.sheetPairButler.reduce((s, x) => s + x.boards, 0);
  const want = played / 2;
  const got = p.results.length;
  return got === want
    ? { id: 'count', label, status: 'pass', detail: `${got} 筆 = ${p.sheetPairButler.length} 對共打 ${played} 副 ÷ 2` }
    : { id: 'count', label, status: 'fail', detail: `解析出 ${got} 筆，預期 ${want} 筆` };
}

function pairTotalsCheck(p: ParsedEvent): Check {
  const label = `配對 ${SCORING_LABEL[p.event.scoring]} 與總成績表`;
  if (p.sheetPairButler.length === 0) return { id: 'totals', label, status: 'skip', detail: '成績表沒有「總成績 名次」工作表' };
  const sheet = (r: BoardResult) => r.nsSheetImp ?? 0;
  return compareTotals(p, 'totals', label, pairSums(p.results, (r, side) => (side === 'NS' ? sheet(r) : -sheet(r))), '對');
}

/** 用得分重算成績表給的單副分數（Butler 或 Cross-IMP） */
function sheetImpCheck(p: ParsedEvent): Check {
  const label = `自算 ${SCORING_LABEL[p.event.scoring]} 與成績表`;
  const groups = groupByBoard(p.results);
  const scored = p.results.filter((r) => !r.contract.adjusted && r.nsSheetImp !== undefined);
  const bad = scored.filter((r) => {
    if (p.event.scoring === 'cross-imp') {
      const others = groups.get(boardKey(r))!.filter((o) => o !== r && !o.contract.adjusted).map((o) => o.nsScore);
      return crossImp(r.nsScore, others) !== r.nsSheetImp;
    }
    return butlerOf(r.nsScore, r.datum) !== r.nsSheetImp;
  });
  return bad.length === 0
    ? { id: 'sheet-imp', label, status: 'pass', detail: `${scored.length} 筆全部一致` }
    : { id: 'sheet-imp', label, status: 'fail', detail: `${bad.length}/${scored.length} 筆不一致（例如第 ${bad[0].board} 副）` };
}

function pairsDatumCheck(p: ParsedEvent): Check {
  const label = '自算 Datum 與成績表';
  if (p.datumSource !== 'sheet') {
    return { id: 'datum', label, status: 'skip', detail: '成績表沒有提供 Datum，系統以去掉最高與最低分後的平均自算' };
  }
  // 雙人賽「牌局分析」的 Mean 是去掉最高與最低分後的平均
  const groups = [...groupByBoard(p.results).values()];
  const bad = groups.filter((rs) => computeDatum(rs.filter((r) => !r.contract.adjusted).map((r) => r.nsScore), 'trimmed') !== rs[0].datum);
  return bad.length === 0
    ? { id: 'datum', label, status: 'pass', detail: `${groups.length} 副全部一致` }
    : { id: 'datum', label, status: 'fail', detail: `${bad.length}/${groups.length} 副不一致；報告仍採用成績表的 Datum，可能是計分軟體算法不同` };
}

// ---------- 共通 ----------

function dealCheck(p: ParsedEvent): Check {
  const label = '牌型完整';
  if (p.deals.length === 0) return { id: 'deals', label, status: 'skip', detail: '成績表沒有牌型工作表，報告不會顯示牌型' };
  const bad = p.deals.filter((d) => {
    const cards = Object.values(d.hands).flatMap((h) => (['S', 'H', 'D', 'C'] as const).flatMap((s) => [...h[s]].map((x) => s + x)));
    return cards.length !== 52 || new Set(cards).size !== 52;
  });
  const keys = new Set(p.deals.map(boardKey));
  const missing = new Set(p.results.filter((r) => !keys.has(boardKey(r))).map((r) => `R${r.round} 第 ${r.board} 副`));
  if (bad.length === 0 && missing.size === 0) return { id: 'deals', label, status: 'pass', detail: `${p.deals.length} 副，每副 52 張` };
  const parts = [];
  if (bad.length) parts.push(`${bad.length} 副牌張數不對`);
  if (missing.size) parts.push(`${missing.size} 副找不到牌型`);
  return { id: 'deals', label, status: 'fail', detail: parts.join('、') };
}

function warningCheck(p: ParsedEvent): Check {
  const n = p.warnings.length;
  return n === 0
    ? { id: 'warnings', label: '解析警告', status: 'pass', detail: '沒有讀不懂的儲存格' }
    : { id: 'warnings', label: '解析警告', status: 'fail', detail: `${n} 則，詳見下方清單` };
}
