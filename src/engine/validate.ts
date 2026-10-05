import type { ParsedEvent } from '../model/types';
import { pairKey } from '../parsers/names';
import { computeDatum, groupByBoard } from './butler';

export type CheckStatus = 'pass' | 'fail' | 'skip';

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
  return [countCheck(p), butlerCheck(p), matchImpCheck(p), datumCheck(p), dealCheck(p), warningCheck(p)];
}

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

function butlerCheck(p: ParsedEvent): Check {
  const label = '配對 Butler 與 ButlerP 工作表';
  if (p.sheetPairButler.length === 0) return { id: 'butler', label, status: 'skip', detail: '成績表沒有 ButlerP 工作表' };
  const totals = new Map<string, { boards: number; imp: number }>();
  const add = (pair: [string, string], team: number, imp: number) => {
    const k = `${team}|${pairKey(pair)}`;
    const t = totals.get(k) ?? { boards: 0, imp: 0 };
    t.boards++;
    t.imp += imp;
    totals.set(k, t);
  };
  for (const r of p.results) {
    add(r.nsPair, r.nsTeam, r.nsButler);
    add(r.ewPair, r.ewTeam, r.ewButler);
  }
  const bad = p.sheetPairButler.filter((s) => {
    const t = totals.get(`${s.teamNo}|${pairKey(s.pair)}`);
    return !t || t.boards !== s.boards || t.imp !== s.imp;
  });
  if (bad.length === 0 && totals.size === p.sheetPairButler.length) {
    return { id: 'butler', label, status: 'pass', detail: `${totals.size} 個配對全部一致` };
  }
  const sample = bad.slice(0, 3).map((s) => s.pair.join(' ')).join('、');
  return { id: 'butler', label, status: 'fail', detail: `${bad.length} 個配對不一致${sample ? `（例如 ${sample}）` : ''}；系統配對數 ${totals.size}，工作表 ${p.sheetPairButler.length}` };
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

function datumCheck(p: ParsedEvent): Check {
  const label = '自算 Datum 與成績表';
  const groups = [...groupByBoard(p.results).values()];
  if (groups.length === 0) return { id: 'datum', label, status: 'skip', detail: '沒有牌局結果' };
  const bad = groups.filter((rs) => computeDatum(rs.filter((r) => !r.contract.adjusted).map((r) => r.nsScore)) !== rs[0].datum);
  // Datum 算法因計分軟體而異；不一致不影響報告（報告採用成績表的 Datum），只提示
  return bad.length === 0
    ? { id: 'datum', label, status: 'pass', detail: `${groups.length} 副全部一致` }
    : { id: 'datum', label, status: 'fail', detail: `${bad.length}/${groups.length} 副不一致；報告仍採用成績表的 Datum，可能是計分軟體算法不同` };
}

function dealCheck(p: ParsedEvent): Check {
  const label = '牌型完整';
  if (p.deals.length === 0) return { id: 'deals', label, status: 'skip', detail: '成績表沒有 Hands 工作表，報告不會顯示牌型' };
  const bad = p.deals.filter((d) => {
    const cards = Object.values(d.hands).flatMap((h) => (['S', 'H', 'D', 'C'] as const).flatMap((s) => [...h[s]].map((x) => s + x)));
    return cards.length !== 52 || new Set(cards).size !== 52;
  });
  const keys = new Set(p.deals.map((d) => `${d.round}|${d.board}`));
  const missing = new Set(p.results.filter((r) => !keys.has(`${r.round}|${r.board}`)).map((r) => `R${r.round} 第 ${r.board} 副`));
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
