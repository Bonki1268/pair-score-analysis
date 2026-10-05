import type { WorkBook } from 'xlsx';
import type { BoardResult, Contract, Deal, Pair, ParsedEvent, ParseWarning, Scoring, Team } from '../model/types';
import { butlerOf, computeDatum, crossImp } from '../engine/butler';
import { parseContract } from './contract';
import { Grid, norm } from './grid';
import { readDeals, standardDealer, standardVul } from './hands';

/** 從某一對的角度記錄的一副牌（個人成績T 的一列） */
interface PairRecord {
  pairNo: number;
  board: number;
  seat: 'NS' | 'EW';
  round: number;
  opp: number;
  contract: Contract;
  /** 這一對的得分 */
  score: number | null;
  imp: number;
  cell: string;
}

/**
 * 解析 IMP 雙人賽成績表（總成績 名次 / 個人成績T / 個人成績D / 牌局分析）。
 * 個人成績T 每一桌出現兩次（南北與東西各一次），合併成一筆南北觀點的桌次結果。
 */
export function parsePairsImp(wb: WorkBook, fileName: string): ParsedEvent {
  const warnings: ParseWarning[] = [];
  const sheet = (name: string): Grid | null => (wb.Sheets[name] ? new Grid(name, wb.Sheets[name]) : null);
  const personal = sheet('個人成績T')!;
  const title = personal.str(0, 0) || fileName.replace(/\.xlsx?$/i, '');
  const eventId = title;

  const { teams, totals } = parseRanking(sheet('總成績 名次'), eventId, warnings);
  const names = new Map(teams.map((t) => [t.teamNo, t.roster as Pair]));
  const records = parsePersonal(personal, names, warnings);
  const means = parseMeans(sheet('牌局分析'));

  // 合併同一桌的兩筆紀錄
  const tables = new Map<string, { ns?: PairRecord; ew?: PairRecord }>();
  for (const r of records) {
    const ns = r.seat === 'NS' ? r.pairNo : r.opp;
    const ew = r.seat === 'EW' ? r.pairNo : r.opp;
    const k = `${r.board}|${ns}|${ew}`;
    const t = tables.get(k) ?? {};
    if (t[r.seat === 'NS' ? 'ns' : 'ew']) {
      warnings.push({ sheet: personal.name, cell: r.cell, raw: `第 ${r.board} 副`, reason: '同一桌出現兩次，略過重複的一筆' });
      continue;
    }
    t[r.seat === 'NS' ? 'ns' : 'ew'] = r;
    tables.set(k, t);
  }

  interface Table {
    board: number;
    round: number;
    ns: number;
    ew: number;
    contract: Contract;
    nsScore: number | null;
    nsSheetImp: number;
  }
  const rows: Table[] = [];
  for (const [k, t] of tables) {
    const [board, ns, ew] = k.split('|').map(Number);
    const main = t.ns ?? t.ew!;
    if (!t.ns || !t.ew) {
      warnings.push({ sheet: personal.name, cell: main.cell, raw: `第 ${board} 副`, reason: `只找到${t.ns ? '南北' : '東西'}一方的紀錄` });
    } else if (t.ns.contract.raw !== t.ew.contract.raw || (t.ns.score !== null && t.ew.score !== null && t.ns.score !== -t.ew.score)) {
      warnings.push({ sheet: personal.name, cell: t.ew.cell, raw: `${t.ns.contract.raw} / ${t.ew.contract.raw}`, reason: '南北與東西兩筆紀錄的合約或得分不一致' });
    }
    const nsScore = t.ns ? t.ns.score : t.ew!.score === null ? null : -t.ew!.score;
    const nsSheetImp = t.ns ? t.ns.imp : -t.ew!.imp;
    rows.push({ board, round: main.round, ns, ew, contract: main.contract, nsScore, nsSheetImp });
  }
  rows.sort((a, b) => a.board - b.board || a.ns - b.ns);

  // Datum：成績表有「牌局分析」的 Mean 就採用，否則以全場平均自算
  const byBoard = new Map<number, Table[]>();
  for (const r of rows) {
    const arr = byBoard.get(r.board) ?? [];
    arr.push(r);
    byBoard.set(r.board, arr);
  }
  const datumSource = byBoard.size > 0 && [...byBoard.keys()].every((b) => means.has(b)) ? 'sheet' : 'computed';
  const datumOf = new Map<number, number>();
  for (const [board, rs] of byBoard) {
    const scores = rs.filter((r) => !r.contract.adjusted && r.nsScore !== null).map((r) => r.nsScore!);
    datumOf.set(board, datumSource === 'sheet' ? means.get(board)! : computeDatum(scores));
  }

  const scoring = detectScoring(rows, datumOf);

  const results: BoardResult[] = rows.map((r) => {
    const datum = datumOf.get(r.board)!;
    // 調整分（Average）的得分視為 Datum，Butler 為 0
    const nsScore = r.contract.adjusted || r.nsScore === null ? datum : r.nsScore;
    const nsButler = r.contract.adjusted ? 0 : butlerOf(nsScore, datum);
    return {
      matchId: `${eventId}|R${r.round}|${r.ns}v${r.ew}`,
      eventId,
      round: r.round,
      dealRound: 0,
      table: r.ns,
      board: r.board,
      room: 'open',
      nsTeam: r.ns,
      ewTeam: r.ew,
      nsPair: names.get(r.ns) ?? [`#${r.ns}`, ''],
      ewPair: names.get(r.ew) ?? [`#${r.ew}`, ''],
      contract: r.contract,
      nsScore,
      nsImp: r.nsSheetImp,
      datum,
      nsButler,
      ewButler: 0 - nsButler,
      nsSheetImp: r.nsSheetImp,
    };
  });

  // 個人成績D 每一對都印一次同一副牌，以牌號去重
  const deals: Deal[] = [];
  const detail = sheet('個人成績D');
  if (!detail) {
    warnings.push({ sheet: '個人成績D', cell: '', raw: '', reason: '缺少 個人成績D 工作表，報告不會顯示牌型' });
  } else {
    const seen = new Set<number>();
    for (const d of readDeals(detail, warnings)) {
      if (seen.has(d.board)) continue;
      seen.add(d.board);
      deals.push({
        eventId,
        round: 0,
        board: d.board,
        dealer: standardDealer(d.board),
        vulnerability: standardVul(d.board),
        hands: d.hands,
      });
    }
    deals.sort((a, b) => a.board - b.board);
  }

  const rounds = Math.max(0, ...rows.map((r) => r.round));
  const boards = byBoard.size;
  return {
    event: {
      eventId,
      name: title,
      kind: 'pairs',
      scoring,
      division: '雙人賽',
      rounds,
      boardsPerRound: rounds ? Math.round(boards / rounds) : boards,
      fileName,
      importedAt: new Date().toISOString(),
    },
    teams,
    matches: [],
    results,
    deals,
    warnings,
    sheetPairButler: totals,
    datumSource,
  };
}

/** 依成績表給的單副分數判斷計分方式：與 Butler 或 Cross-IMP 重算結果吻合較多者 */
function detectScoring(
  rows: { board: number; contract: Contract; nsScore: number | null; nsSheetImp: number }[],
  datumOf: Map<number, number>,
): Scoring {
  let butler = 0;
  let cross = 0;
  for (const r of rows) {
    if (r.contract.adjusted || r.nsScore === null) continue;
    const others = rows.filter((o) => o.board === r.board && o !== r && !o.contract.adjusted && o.nsScore !== null).map((o) => o.nsScore!);
    if (butlerOf(r.nsScore, datumOf.get(r.board)!) === r.nsSheetImp) butler++;
    if (crossImp(r.nsScore, others) === r.nsSheetImp) cross++;
  }
  return cross > butler ? 'cross-imp' : 'butler';
}

// ---------- 總成績 名次 ----------

function parseRanking(g: Grid | null, eventId: string, warnings: ParseWarning[]) {
  const teams: Team[] = [];
  const totals: ParsedEvent['sheetPairButler'] = [];
  if (!g) {
    warnings.push({ sheet: '總成績 名次', cell: '', raw: '', reason: '缺少「總成績 名次」工作表，無法讀取名次' });
    return { teams, totals };
  }
  for (let r = 0; r < Math.min(g.rowCount, 5); r++) {
    const col = (label: string) => g.findCol(r, label);
    const pairC = col('Pair');
    const n1 = col('Name 1');
    const n2 = col('Name 2');
    if (pairC < 0 || n1 < 0 || n2 < 0) continue;
    const impC = col('IMP');
    const totalC = col('Total IMP');
    const rankC = col('Rank Total');
    const boardsC = col('Bd Played');
    for (let rr = r + 1; rr < g.rowCount; rr++) {
      const no = g.num(rr, pairC);
      const a = g.str(rr, n1);
      if (no === null || !a) continue;
      const pair: Pair = [a, g.str(rr, n2)];
      teams.push({
        eventId,
        teamNo: no,
        name: pair.filter(Boolean).join('／'),
        finalVp: totalC >= 0 ? (g.num(rr, totalC) ?? 0) : 0,
        rank: rankC >= 0 ? (g.num(rr, rankC) ?? 0) : 0,
        roster: pair,
      });
      totals.push({ pair, teamNo: no, boards: boardsC >= 0 ? (g.num(rr, boardsC) ?? 0) : 0, imp: impC >= 0 ? (g.num(rr, impC) ?? 0) : 0 });
    }
    break;
  }
  teams.sort((a, b) => a.teamNo - b.teamNo);
  return { teams, totals };
}

// ---------- 個人成績T ----------

function parsePersonal(g: Grid, names: Map<number, Pair>, warnings: ParseWarning[]): PairRecord[] {
  const out: PairRecord[] = [];
  let pairNo: number | null = null;
  let cols: Record<string, number> | null = null;
  let round = 0;
  let opp = 0;
  for (let r = 0; r < g.rowCount; r++) {
    // 每一對的標題列：A 欄是對號、同一列有「Rank:」
    if (g.cells(r).some((x) => x.v === 'Rank:') && g.num(r, 0) !== null) {
      pairNo = g.num(r, 0);
      cols = null;
      round = 0;
      opp = 0;
      if (pairNo !== null && !names.has(pairNo)) {
        names.set(pairNo, [g.str(r, 2), g.str(r + 1, 2)]);
      }
      continue;
    }
    if (g.str(r, 0) === 'Board') {
      const find = (label: string) => g.findCol(r, label);
      cols = { board: find('Board'), seat: find('Seat'), round: find('Round'), contract: find('Contract'), score: find('My Score'), imp: find('My IMP'), vs: find('vs') };
      continue;
    }
    if (pairNo === null || !cols) continue;
    const board = g.num(r, cols.board);
    const seatRaw = norm(g.str(r, cols.seat)).replace(/[()]/g, '');
    if (board === null || (seatRaw !== 'NS' && seatRaw !== 'EW')) continue;
    // 輪次與對手只寫在該輪第一副
    const rd = g.num(r, cols.round);
    if (rd !== null) {
      round = rd;
      opp = g.num(r, cols.vs) ?? opp;
    }
    const raw = g.str(r, cols.contract);
    const parsed = parseContract(raw);
    if (!parsed.ok) {
      warnings.push({ sheet: g.name, cell: g.ref(r, cols.contract), raw, reason: parsed.reason });
      continue;
    }
    if (!opp) {
      warnings.push({ sheet: g.name, cell: g.ref(r, cols.vs), raw: '', reason: '找不到對手對號' });
      continue;
    }
    out.push({
      pairNo,
      board,
      seat: seatRaw,
      round,
      opp,
      contract: parsed.contract,
      score: g.num(r, cols.score),
      imp: g.num(r, cols.imp) ?? 0,
      cell: g.ref(r, 0),
    });
  }
  return out;
}

// ---------- 牌局分析 ----------

/** 「Board   N」右側「Mean:」後面的數字 */
function parseMeans(g: Grid | null): Map<number, number> {
  const means = new Map<number, number>();
  if (!g) return means;
  for (let r = 0; r < g.rowCount; r++) {
    for (const { c, v } of g.cells(r)) {
      const m = typeof v === 'string' ? /^Board\s+(\d+)$/.exec(v.trim()) : null;
      if (!m || g.str(r, c + 1) !== 'Mean:') continue;
      const mean = g.num(r, c + 2);
      if (mean !== null) means.set(Number(m[1]), mean);
    }
  }
  return means;
}
