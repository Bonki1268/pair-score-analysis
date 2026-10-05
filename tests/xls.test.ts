import { beforeAll, describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkbook } from '../src/parsers/detect';
import { isZip, loadCodepages } from '../src/parsers/grid';
import { validateEvent } from '../src/engine/validate';
import { DATA_DIR, dataFiles, load } from './helpers';

// 把 xlsx 轉存成 xls（Excel 97–2003，BIFF8）再解析，結果必須和原檔完全相同。
// SheetJS 寫入 Excel 95（BIFF5）時無法保留中文，所以不測 BIFF5；讀取 BIFF5 靠 grid.ts 載入的字碼表。
describe.skipIf(dataFiles.length === 0)('xls 格式', () => {
  beforeAll(() => loadCodepages());

  // 只轉存隊制賽：SheetJS 轉存雙人賽成績表時產生的 xls 讀不回來；雙人賽的 xls 由台南的實際檔案測試
  describe.each(dataFiles.filter((f) => f.endsWith('.xlsx') && load(f).event.kind === 'teams'))('%s', (file) => {
    test('biff8', () => {
      const wb = XLSX.read(readFileSync(join(DATA_DIR, file)), { type: 'buffer' });
      const xls = XLSX.write(wb, { type: 'array', bookType: 'biff8' }) as ArrayBuffer;
      expect(isZip(new Uint8Array(xls))).toBe(false);
      const name = file.replace(/\.xlsx$/, '.xls');
      const p = parseWorkbook(new Uint8Array(xls), name);
      const orig = load(file);
      expect(validateEvent(p).filter((c) => c.status === 'fail')).toEqual([]);
      expect(p.event.name).toBe(orig.event.name);
      expect(p.results).toEqual(orig.results);
      expect(p.teams).toEqual(orig.teams);
      expect(p.deals).toEqual(orig.deals);
    }, 60_000);
  });
});
