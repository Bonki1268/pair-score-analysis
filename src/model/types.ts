// 架構書第 4 節的資料表。分數一律為南北觀點。

export type Seat = 'N' | 'E' | 'S' | 'W';
export type Side = 'NS' | 'EW';
export type Strain = 'C' | 'D' | 'H' | 'S' | 'N';
export type Room = 'open' | 'closed';
export type Vulnerability = 'None' | 'NS' | 'EW' | 'Both';

export interface Contract {
  raw: string;
  /** 0 = Pass */
  level: number;
  strain: Strain | null;
  /** 0 無、1 賭倍、2 再賭倍 */
  doubled: 0 | 1 | 2;
  declarer: Seat | null;
  /** 主打方拿到的總墩數（Pass 為 0） */
  tricks: number;
  /** 相對合約的超墩（≥0）或宕墩（<0） */
  overtricks: number;
  /** 裁判判給的調整分（成績表寫 A / Average），不屬於任何合約 */
  adjusted?: boolean;
}

/** teams：隊制賽；pairs：雙人賽 */
export type EventKind = 'teams' | 'pairs';
/** 成績表原本的計分方式 */
export type Scoring = 'imp-teams' | 'butler' | 'cross-imp';

export interface Event {
  eventId: string;
  name: string;
  kind: EventKind;
  scoring: Scoring;
  /** 組別，例如「學生組」「乙組」 */
  division: string;
  rounds: number;
  boardsPerRound: number;
  fileName: string;
  importedAt: string;
}

export interface Team {
  eventId: string;
  teamNo: number;
  name: string;
  finalVp: number;
  rank: number;
  roster: string[];
}

export interface Match {
  matchId: string;
  eventId: string;
  round: number;
  table: number;
  homeTeam: number;
  awayTeam: number;
  homeImp: number;
  awayImp: number;
  homeVp: number;
  awayVp: number;
}

export type Pair = [string, string];

export interface BoardResult {
  matchId: string;
  eventId: string;
  /** 這一桌打這副牌的輪次 */
  round: number;
  /**
   * 牌組所屬的輪次：同一副牌全場相同，用來找出「全場結果」與牌型。
   * 隊制賽每輪換一組牌（等於 round）；雙人賽同一副牌各桌在不同輪打，整場為 0。省略時等於 round。
   */
  dealRound?: number;
  table: number;
  board: number;
  room: Room;
  nsTeam: number;
  ewTeam: number;
  nsPair: Pair;
  ewPair: Pair;
  contract: Contract;
  nsScore: number;
  /** 這副牌在對局中南北所屬隊伍拿到的淨 IMP */
  nsImp: number;
  /** 南北觀點的 Datum */
  datum: number;
  nsButler: number;
  ewButler: number;
  /** 雙人賽成績表原本給南北的這副分數（Cross-IMP 或 Butler），核對與顯示用 */
  nsSheetImp?: number;
}

export interface Hand {
  S: string;
  H: string;
  D: string;
  C: string;
}

export interface Deal {
  eventId: string;
  /** 牌組所屬的輪次，對應 BoardResult 的 dealRound */
  round: number;
  board: number;
  dealer: Seat;
  vulnerability: Vulnerability;
  hands: Record<Seat, Hand>;
}

export interface ParseWarning {
  sheet: string;
  cell: string;
  raw: string;
  reason: string;
}

/** Datum 的來源 */
export type DatumSource = 'sheet' | 'computed';

/** 一份成績表解析後的全部資料 */
export interface ParsedEvent {
  event: Event;
  teams: Team[];
  matches: Match[];
  results: BoardResult[];
  deals: Deal[];
  warnings: ParseWarning[];
  /**
   * 成績表提供的配對總分（交叉核對用）：隊制賽來自 ButlerP 工作表（Butler），
   * 雙人賽來自「總成績」工作表（成績表原本的計分方式，不含 COP）
   */
  sheetPairButler: { pair: Pair; teamNo: number; boards: number; imp: number }[];
  /** 雙人賽 Datum 的來源：成績表「牌局分析」的 Mean，或系統自算 */
  datumSource?: DatumSource;
}

export const SEATS: Seat[] = ['N', 'E', 'S', 'W'];

export function sideOf(seat: Seat): Side {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

export function otherSide(side: Side): Side {
  return side === 'NS' ? 'EW' : 'NS';
}
