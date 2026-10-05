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

export interface Event {
  eventId: string;
  name: string;
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
  round: number;
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
}

export interface Hand {
  S: string;
  H: string;
  D: string;
  C: string;
}

export interface Deal {
  eventId: string;
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

/** 一份成績表解析後的全部資料 */
export interface ParsedEvent {
  event: Event;
  teams: Team[];
  matches: Match[];
  results: BoardResult[];
  deals: Deal[];
  warnings: ParseWarning[];
  /** 成績表 ButlerP 工作表提供的配對 Butler（交叉核對用） */
  sheetPairButler: { pair: Pair; teamNo: number; boards: number; imp: number }[];
}

export const SEATS: Seat[] = ['N', 'E', 'S', 'W'];

export function sideOf(seat: Seat): Side {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

export function otherSide(side: Side): Side {
  return side === 'NS' ? 'EW' : 'NS';
}
