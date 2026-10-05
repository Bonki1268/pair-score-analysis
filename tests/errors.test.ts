import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, ParseError } from '../src/parsers/detect';

const book = (sheets: Record<string, unknown[][]>) => {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

describe('異常輸入顯示明確錯誤', () => {
  test('不是 xlsx', () => {
    expect(() => parseWorkbook(new TextEncoder().encode('not a spreadsheet at all'), 'a.xlsx')).toThrow(ParseError);
  });
  test('非成績表的 xlsx', () => {
    expect(() => parseWorkbook(book({ Sheet1: [['姓名', '電話']] }), 'b.xlsx')).toThrow(/不是支援的成績表/);
  });
  test('有工作表名稱但沒有內容', () => {
    expect(() => parseWorkbook(book({ 'Swiss R': [[]], R1: [[]] }), 'c.xlsx')).toThrow(/沒有解析出任何牌局結果/);
  });
});
