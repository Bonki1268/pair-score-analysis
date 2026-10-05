import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkbook } from '../src/parsers/detect';
import { loadCodepages } from '../src/parsers/grid';
import type { ParsedEvent } from '../src/model/types';

// 成績表與黃金標準值都含真實姓名，不進版控：放在本機 資料/ 底下，CI 沒有檔案時跳過相關測試
export const DATA_DIR = join(__dirname, '..', '資料');

/** 資料/ 底下所有成績表（略過 Excel 開檔時產生的 ~$ 暫存檔） */
export const dataFiles: string[] = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR).filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('~$')).sort()
  : [];

export interface Golden {
  files: Record<
    string,
    {
      results: number;
      teams: number;
      rounds: number;
      boardsPerRound: number;
      champion: { name: string; vp: number; wins?: number; losses?: number };
      /** score 為 sheet 時比對成績表原本的分數（例如 Cross-IMP），否則比對 Butler */
      pairs: { pair: [string, string]; boards: number; imp: number; score?: 'sheet' }[];
    }
  >;
  merged?: { query: string; player: string; teams: string[]; boards: number; imp: number };
  /** 主流合約平手規則的驗收測試對象（第 28 屆植鑑盃混合組） */
  tiePolicy?: { file: string; player: string; partner: string };
}

const goldenPath = join(DATA_DIR, 'golden.json');
export const golden: Golden | null = existsSync(goldenPath) ? JSON.parse(readFileSync(goldenPath, 'utf8')) : null;
export const goldenFiles = golden ? Object.keys(golden.files).filter((f) => dataFiles.includes(f)) : [];
/** 黃金標準值裡的檔案全部都在時，才跑跨檔案的端對端測試 */
export const hasGolden = golden !== null && goldenFiles.length === Object.keys(golden.files).length && goldenFiles.length > 0;

// 舊版 .xls 需要字碼表
await loadCodepages();

const cache = new Map<string, ParsedEvent>();
export function load(file: string): ParsedEvent {
  let p = cache.get(file);
  if (!p) {
    p = parseWorkbook(readFileSync(join(DATA_DIR, file)), file);
    cache.set(file, p);
  }
  return p;
}
