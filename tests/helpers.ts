import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkbook } from '../src/parsers/detect';
import type { ParsedEvent } from '../src/model/types';

// 成績表與黃金標準值都含真實姓名，不進版控：放在本機 資料/ 底下，CI 沒有檔案時跳過相關測試
export const DATA_DIR = join(__dirname, '..', '資料');

/** 資料/ 底下所有成績表（略過 Excel 開檔時產生的 ~$ 暫存檔） */
export const dataFiles: string[] = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$')).sort()
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
      pairs: { pair: [string, string]; boards: number; imp: number }[];
    }
  >;
  merged?: { query: string; player: string; team: string; boards: number; imp: number };
}

const goldenPath = join(DATA_DIR, 'golden.json');
export const golden: Golden | null = existsSync(goldenPath) ? JSON.parse(readFileSync(goldenPath, 'utf8')) : null;
export const goldenFiles = golden ? Object.keys(golden.files).filter((f) => dataFiles.includes(f)) : [];
/** 黃金標準值裡的檔案全部都在時，才跑跨檔案的端對端測試 */
export const hasGolden = golden !== null && goldenFiles.length === Object.keys(golden.files).length && goldenFiles.length > 0;

const cache = new Map<string, ParsedEvent>();
export function load(file: string): ParsedEvent {
  let p = cache.get(file);
  if (!p) {
    p = parseWorkbook(readFileSync(join(DATA_DIR, file)), file);
    cache.set(file, p);
  }
  return p;
}
