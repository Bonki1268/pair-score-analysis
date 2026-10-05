import type { WorkBook } from 'xlsx';
import type {
  BoardResult,
  Deal,
  Match,
  Pair,
  ParsedEvent,
  ParseWarning,
  Room,
  Seat,
  Team,
  Vulnerability,
} from '../model/types';
import { parseContract } from './contract';
import { Grid, norm } from './grid';
import { readDeals, standardDealer, standardVul } from './hands';
import { splitPair } from './names';

/**
 * 解析 Swiss R / R1…Rn / Hands / ButlerP 格式的隊制賽成績表。
 * 欄位一律以標題文字定位，不寫死欄號。
 */
export function parseSwissImp(wb: WorkBook, fileName: string): ParsedEvent {
  const warnings: ParseWarning[] = [];
  const sheet = (name: string): Grid | null => (wb.Sheets[name] ? new Grid(name, wb.Sheets[name]) : null);

  const roundSheets = wb.SheetNames.filter((n) => /^R\d+$/.test(n))
    .map((n) => ({ name: n, round: Number(n.slice(1)) }))
    .sort((a, b) => a.round - b.round);

  const firstRound = sheet(roundSheets[0].name)!;
  const title = findTitle(firstRound) ?? fileName.replace(/\.xlsx?$/i, '');
  const eventId = title;

  const teams = parseTeams(sheet('Swiss R'), sheet('Players'), eventId, warnings);
  const rosterByTeam = new Map(teams.map((t) => [t.teamNo, t.roster]));

  const matches: Match[] = [];
  const results: BoardResult[] = [];
  const boardMeta = new Map<string, { round: number; dealer: Seat; vul: Vulnerability }>();
  let boardsPerRound = 0;

  for (const { name, round } of roundSheets) {
    const g = sheet(name)!;
    const blocks = findBlocks(g);
    const seen = new Set<number>();
    for (const b of blocks) {
      if (b.home > b.away) continue; // 同一場的另一隊視角
      if (seen.has(b.table)) {
        warnings.push({ sheet: name, cell: g.ref(b.row, 0), raw: `Table ${b.table}`, reason: '桌次重複，略過' });
        continue;
      }
      seen.add(b.table);
      const parsed = parseBlock(g, b, eventId, round, rosterByTeam, warnings);
      if (!parsed) continue;
      matches.push(parsed.match);
      results.push(...parsed.results);
      for (const [board, meta] of parsed.boardMeta) boardMeta.set(`${round}|${board}`, { round, ...meta });
      boardsPerRound = Math.max(boardsPerRound, parsed.boardMeta.size);
    }
  }

  const deals = parseHands(sheet('Hands'), eventId, boardMeta, warnings);
  const sheetPairButler = parseButlerP(sheet('ButlerP'));

  const parts = title.split(/\s+/);
  return {
    event: {
      eventId,
      name: title,
      kind: 'teams',
      scoring: 'imp-teams',
      division: parts.length > 1 ? parts[parts.length - 1] : '',
      rounds: roundSheets.length,
      boardsPerRound,
      fileName,
      importedAt: new Date().toISOString(),
    },
    teams,
    matches,
    results,
    deals,
    warnings,
    sheetPairButler,
  };
}

function findTitle(g: Grid): string | null {
  for (let r = 0; r < 4; r++) {
    for (const { v } of g.cells(r)) {
      if (typeof v === 'string' && /[一-鿿]/.test(v) && v.length >= 4) return v.trim();
    }
  }
  return null;
}

// ---------- 隊伍 ----------

function parseTeams(swiss: Grid | null, players: Grid | null, eventId: string, warnings: ParseWarning[]): Team[] {
  const rosters = new Map<number, string[]>();
  if (players) {
    for (let r = 0; r < Math.min(players.rowCount, 10); r++) {
      const nameCol = players.findCol(r, '隊名');
      const firstPlayer = players.findCol(r, '賽員 1');
      if (nameCol < 0 || firstPlayer < 0) continue;
      for (let rr = r + 1; rr < players.rowCount; rr++) {
        const no = players.num(rr, nameCol - 1);
        if (no === null) continue;
        const roster: string[] = [];
        for (let c = firstPlayer; c < firstPlayer + 12; c++) {
          const s = players.str(rr, c);
          if (s && players.str(r, c).startsWith('賽員')) roster.push(s);
        }
        rosters.set(no, roster);
      }
      break;
    }
  }

  const teams: Team[] = [];
  if (!swiss) {
    warnings.push({ sheet: 'Swiss R', cell: '', raw: '', reason: '缺少 Swiss R 工作表，無法讀取隊伍名次' });
    return teams;
  }
  const vpCol = swiss.findCol(0, '原始 總勝分');
  const rankCol = swiss.findCol(0, '原始 總名次');
  for (let r = 2; r < swiss.rowCount; r++) {
    const no = swiss.num(r, 0);
    const name = swiss.str(r, 1);
    if (no === null || !name) continue;
    teams.push({
      eventId,
      teamNo: no,
      name,
      finalVp: vpCol >= 0 ? (swiss.num(r, vpCol) ?? 0) : 0,
      rank: rankCol >= 0 ? (swiss.num(r, rankCol) ?? 0) : 0,
      roster: rosters.get(no) ?? [],
    });
  }
  return teams.sort((a, b) => a.teamNo - b.teamNo);
}

// ---------- 對局區塊 ----------

interface Block {
  row: number;
  home: number;
  away: number;
  table: number;
  end: number;
}

/** 每個「NS … Table」列開始一個對局區塊 */
function findBlocks(g: Grid): Block[] {
  const starts: Omit<Block, 'end'>[] = [];
  for (let r = 0; r < g.rowCount; r++) {
    if (g.str(r, 0) !== 'NS') continue;
    const cells = g.cells(r);
    const tableIdx = cells.findIndex((x) => x.v === 'Table');
    if (tableIdx < 0) continue;
    const nums = cells.filter((x) => typeof x.v === 'number').map((x) => x.v as number);
    if (nums.length < 3) continue;
    starts.push({ row: r, home: nums[0], table: nums[1], away: nums[2] });
  }
  return starts.map((s, i) => ({ ...s, end: i + 1 < starts.length ? starts[i + 1].row : g.rowCount }));
}

interface PairCell {
  raw: string;
  names: string;
  room: Room | null;
}

function readPairCell(s: string): PairCell {
  const m = /^(.*?)\s*\((開O|閉C|開|閉|O|C)\)\s*$/.exec(s);
  if (!m) return { raw: s, names: s.trim(), room: null };
  return { raw: s, names: m[1].trim(), room: m[2].startsWith('開') || m[2] === 'O' ? 'open' : 'closed' };
}

function parseBlock(
  g: Grid,
  b: Block,
  eventId: string,
  round: number,
  rosterByTeam: Map<number, string[]>,
  warnings: ParseWarning[],
) {
  const nsRow = b.row;
  const ewRow = b.row + 1;
  const nsStrings = g.cells(nsRow).filter((x) => typeof x.v === 'string' && x.v !== 'NS' && x.v !== 'Table');
  const ewStrings = g.cells(ewRow).filter((x) => typeof x.v === 'string' && x.v !== 'EW');
  if (nsStrings.length < 2 || ewStrings.length < 2) {
    warnings.push({ sheet: g.name, cell: g.ref(nsRow, 0), raw: '', reason: '找不到配對名單' });
    return null;
  }
  // 左側是主隊、右側是客隊
  const homeNs = readPairCell(String(nsStrings[0].v));
  const awayNs = readPairCell(String(nsStrings[1].v));
  const homeEw = readPairCell(String(ewStrings[0].v));
  const awayEw = readPairCell(String(ewStrings[1].v));
  if (homeNs.room === 'closed' || awayEw.room === 'closed') {
    warnings.push({ sheet: g.name, cell: g.ref(nsRow, 0), raw: homeNs.raw, reason: '主隊南北不在公開室，房間標記與欄位不一致' });
  }
  const homeRoster = rosterByTeam.get(b.home) ?? [];
  const awayRoster = rosterByTeam.get(b.away) ?? [];
  const pair = (p: PairCell, roster: string[], r: number): Pair => {
    const split = splitPair(p.names, roster);
    if (!split.confident) {
      warnings.push({ sheet: g.name, cell: g.ref(r, 0), raw: p.raw, reason: '配對名單無法確定如何拆成兩人' });
    }
    return split.pair;
  };
  const openNs = pair(homeNs, homeRoster, nsRow);
  const closedEw = pair(homeEw, homeRoster, ewRow);
  const closedNs = pair(awayNs, awayRoster, nsRow);
  const openEw = pair(awayEw, awayRoster, ewRow);

  // 標題列
  let hdr = -1;
  for (let r = b.row + 2; r < Math.min(b.end, b.row + 12); r++) {
    if (g.findCol(r, '公開室') >= 0) {
      hdr = r;
      break;
    }
  }
  if (hdr < 0) {
    warnings.push({ sheet: g.name, cell: g.ref(b.row, 0), raw: '', reason: '找不到「公開室」標題列' });
    return null;
  }
  const sub = hdr + 1;
  const groups = ['B#', 'DL', '身價', '公開室', '關閉室', '差數', '國際序分', 'COP', 'Datum']
    .map((label) => ({ label, c: g.findCol(hdr, label) }))
    .filter((x) => x.c >= 0)
    .sort((a, b2) => a.c - b2.c);
  const groupRange = (label: string): [number, number] => {
    const i = groups.findIndex((x) => x.label === label);
    if (i < 0) return [-1, -1];
    return [groups[i].c, i + 1 < groups.length ? groups[i + 1].c : groups[i].c + 12];
  };
  const subCols = (label: string): number[] => {
    const [from, to] = groupRange(label);
    if (from < 0) return [];
    return g
      .cells(sub)
      .filter((x) => x.c >= from && x.c < to)
      .map((x) => x.c);
  };
  const colBoard = g.findCol(hdr, 'B#');
  const colDealer = g.findCol(hdr, 'DL');
  const colVul = g.findCol(hdr, '身價');
  const [openC, openNsC, openEwC] = subCols('公開室');
  const [closedC, closedNsC, closedEwC] = subCols('關閉室');
  const [impHomeC, impAwayC] = subCols('國際序分');
  const [copHomeC, copAwayC] = subCols('COP');
  const [datumC, butlerOpenNsC, butlerClosedEwC] = subCols('Datum');
  if ([colBoard, openC, closedC, impHomeC, impAwayC].some((c) => c === undefined || c < 0)) {
    warnings.push({ sheet: g.name, cell: g.ref(hdr, 0), raw: '', reason: '標題列缺少必要欄位' });
    return null;
  }

  const matchId = `${eventId}|R${round}|T${b.table}`;
  const results: BoardResult[] = [];
  const boardMeta = new Map<number, { dealer: Seat; vul: Vulnerability }>();
  let homeVp = 0;
  let awayVp = 0;
  let homeImp = 0;
  let awayImp = 0;

  for (let r = sub + 1; r < b.end; r++) {
    const label = g.str(r, 0);
    if (label.startsWith('總計')) {
      homeImp = g.num(r, impHomeC) ?? 0;
      awayImp = g.num(r, impAwayC) ?? 0;
      continue;
    }
    if (label.includes('VP')) {
      const nums = g.cells(r).filter((x) => typeof x.v === 'number');
      homeVp = Number(nums[0]?.v ?? 0);
      awayVp = Number(nums[1]?.v ?? 0);
      continue;
    }
    const board = g.num(r, colBoard);
    if (board === null || label === '') continue;
    const openRaw = g.str(r, openC);
    const closedRaw = g.str(r, closedC);
    if (!openRaw && !closedRaw) continue; // 未使用的牌號列

    const dealer = g.str(r, colDealer) as Seat;
    const vul = normalizeVul(g.str(r, colVul));
    if ('NESW'.includes(dealer) && dealer) boardMeta.set(board, { dealer, vul });

    // COP 欄是裁判在這副牌額外判給的 IMP，已含在對局總 IMP 裡
    const cop = (c: number | undefined) => (c === undefined ? 0 : (g.num(r, c) ?? 0));
    const boardImp = (g.num(r, impHomeC) ?? 0) + cop(copHomeC) - (g.num(r, impAwayC) ?? 0) - cop(copAwayC);
    const datum = datumC !== undefined ? parseDatum(g.str(r, datumC)) : null;
    if (datum === null) {
      warnings.push({ sheet: g.name, cell: g.ref(r, datumC ?? 0), raw: g.str(r, datumC ?? 0), reason: '無法解析 Datum' });
    }
    const butlerOpenNs = butlerOpenNsC !== undefined ? (g.num(r, butlerOpenNsC) ?? 0) : 0;
    const butlerClosedEw = butlerClosedEwC !== undefined ? (g.num(r, butlerClosedEwC) ?? 0) : 0;

    const rooms: { room: Room; raw: string; c: number; nsC: number; ewC: number; nsPair: Pair; ewPair: Pair; nsTeam: number; ewTeam: number; nsButler: number }[] = [
      { room: 'open', raw: openRaw, c: openC, nsC: openNsC, ewC: openEwC, nsPair: openNs, ewPair: openEw, nsTeam: b.home, ewTeam: b.away, nsButler: butlerOpenNs },
      { room: 'closed', raw: closedRaw, c: closedC, nsC: closedNsC, ewC: closedEwC, nsPair: closedNs, ewPair: closedEw, nsTeam: b.away, ewTeam: b.home, nsButler: 0 - butlerClosedEw },
    ];
    for (const rm of rooms) {
      const parsed = parseContract(rm.raw);
      if (!parsed.ok) {
        warnings.push({ sheet: g.name, cell: g.ref(r, rm.c), raw: rm.raw, reason: parsed.reason });
        continue;
      }
      // 調整分的得分欄可能寫「Average」，此時以 Datum 代替
      const nsCell = g.num(r, rm.nsC);
      const ewCell = g.num(r, rm.ewC);
      const nsScore =
        parsed.contract.adjusted && (nsCell === null || ewCell === null)
          ? (datum ?? 0)
          : (nsCell ?? 0) - (ewCell ?? 0);
      results.push({
        matchId,
        eventId,
        round,
        table: b.table,
        board,
        room: rm.room,
        nsTeam: rm.nsTeam,
        ewTeam: rm.ewTeam,
        nsPair: rm.nsPair,
        ewPair: rm.ewPair,
        contract: parsed.contract,
        nsScore,
        nsImp: rm.room === 'open' ? boardImp : -boardImp,
        datum: datum ?? 0,
        nsButler: rm.nsButler,
        ewButler: 0 - rm.nsButler,
      });
    }
  }

  const match: Match = { matchId, eventId, round, table: b.table, homeTeam: b.home, awayTeam: b.away, homeImp, awayImp, homeVp, awayVp };
  return { match, results, boardMeta };
}

/** `NS180` → 180、`EW230` → −230 */
export function parseDatum(s: string): number | null {
  const m = /^(NS|EW)?\s*(-?\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[2]);
  return m[1] === 'EW' ? -v : v;
}

function normalizeVul(s: string): Vulnerability {
  const t = s.replace(/\s+/g, '').toLowerCase();
  if (t === 'ns') return 'NS';
  if (t === 'ew') return 'EW';
  if (t === 'both' || t === 'all') return 'Both';
  return 'None';
}

// ---------- 牌型 ----------

function parseHands(
  g: Grid | null,
  eventId: string,
  boardMeta: Map<string, { round: number; dealer: Seat; vul: Vulnerability }>,
  warnings: ParseWarning[],
): Deal[] {
  if (!g) {
    warnings.push({ sheet: 'Hands', cell: '', raw: '', reason: '缺少 Hands 工作表，報告不會顯示牌型' });
    return [];
  }
  return readDeals(g, warnings).map((d) => {
    const meta = boardMeta.get(`${d.round}|${d.board}`);
    return {
      eventId,
      round: d.round,
      board: d.board,
      dealer: meta?.dealer ?? standardDealer(d.board),
      vulnerability: meta?.vul ?? standardVul(d.board),
      hands: d.hands,
    };
  });
}

// ---------- ButlerP ----------

function parseButlerP(g: Grid | null): ParsedEvent['sheetPairButler'] {
  if (!g) return [];
  for (let r = 0; r < Math.min(g.rowCount, 10); r++) {
    const p1 = g.findCol(r, '賽員 1');
    const p2 = g.findCol(r, '賽員 2');
    const boards = g.findCol(r, '牌數');
    const teamNo = g.findCol(r, '隊號');
    const total = g.cells(r).find((x) => typeof x.v === 'string' && norm(x.v) === '總平均分IMP')?.c ?? -1;
    if (p1 < 0 || p2 < 0 || boards < 0 || total < 0) continue;
    const out: ParsedEvent['sheetPairButler'] = [];
    for (let rr = r + 1; rr < g.rowCount; rr++) {
      const a = g.str(rr, p1);
      const b = g.str(rr, p2);
      const n = g.num(rr, boards);
      if (!a || !b || n === null) continue;
      out.push({ pair: [a, b], teamNo: g.num(rr, teamNo) ?? 0, boards: n, imp: g.num(rr, total) ?? 0 });
    }
    return out;
  }
  return [];
}
