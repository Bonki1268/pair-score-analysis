import type { WorkBook } from 'xlsx';
import type { ParsedEvent } from '../model/types';
import { readWorkbook } from './grid';
import { parsePairsImp } from './pairs-imp';
import { parseSwissImp } from './swiss-imp';

export class ParseError extends Error {}

export type FormatId = 'swiss-imp' | 'pairs-imp';

/** 依工作表名稱判斷計分軟體格式 */
export function detectFormat(wb: WorkBook): FormatId | null {
  const names = new Set(wb.SheetNames);
  const hasRounds = wb.SheetNames.some((n) => /^R\d+$/.test(n));
  if (names.has('Swiss R') && hasRounds) return 'swiss-imp';
  if (names.has('個人成績T') && names.has('總成績 名次')) return 'pairs-imp';
  return null;
}

export function parseWorkbook(data: ArrayBuffer | Uint8Array, fileName: string): ParsedEvent {
  let wb: WorkBook;
  try {
    wb = readWorkbook(data);
  } catch {
    throw new ParseError(`「${fileName}」不是可讀取的 Excel 檔案（xlsx 或 xls）`);
  }
  if (wb.SheetNames.length === 0) throw new ParseError(`「${fileName}」是空白檔案`);
  const format = detectFormat(wb);
  if (!format) {
    throw new ParseError(
      `「${fileName}」不是支援的成績表：隊制賽需要 Swiss R 與 R1…Rn 工作表，雙人賽需要「總成績 名次」與「個人成績T」工作表`,
    );
  }
  const parsed = format === 'swiss-imp' ? parseSwissImp(wb, fileName) : parsePairsImp(wb, fileName);
  if (parsed.results.length === 0) {
    throw new ParseError(`「${fileName}」沒有解析出任何牌局結果`);
  }
  return parsed;
}
