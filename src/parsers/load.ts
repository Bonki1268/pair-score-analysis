import { parseWorkbook } from './detect';
import { isZip, loadCodepages } from './grid';
import type { ParsedEvent } from '../model/types';

/**
 * 解析一份成績表檔案。這個模組連同 xlsx 套件由 main.ts 動態載入，
 * 只在真的要解析檔案時才下載，首頁不用先載入約 430 KB 的程式。
 */
export async function parseFile(data: Uint8Array, fileName: string): Promise<ParsedEvent> {
  if (!isZip(data)) await loadCodepages();
  return parseWorkbook(data, fileName);
}
