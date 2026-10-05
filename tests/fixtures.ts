import { parseContract } from '../src/parsers/contract';
import type { BoardResult, Pair } from '../src/model/types';

let table = 0;
/** 造一筆測試用的桌次結果；`me` 一律坐南北，搭檔為「搭檔」 */
export function br(contract: string, opts: Partial<BoardResult> & { nsPair?: Pair } = {}): BoardResult {
  const parsed = parseContract(contract);
  if (!parsed.ok) throw new Error(contract);
  table++;
  return {
    matchId: `m${table}`,
    eventId: 'E',
    round: 1,
    table,
    board: 1,
    room: 'open',
    nsTeam: 1,
    ewTeam: 2,
    nsPair: [`ns${table}a`, `ns${table}b`],
    ewPair: [`ew${table}a`, `ew${table}b`],
    contract: parsed.contract,
    nsScore: 0,
    nsImp: 0,
    datum: 0,
    nsButler: 0,
    ewButler: 0,
    ...opts,
  };
}
