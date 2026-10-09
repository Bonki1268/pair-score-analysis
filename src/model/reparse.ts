import { renameEvent } from './event-id';
import type { StoredEvent } from './store';
import type { ParsedEvent } from './types';

export interface RefreshResult {
  events: StoredEvent[];
  /** 用原始檔重新解析過、需要寫回儲存區的賽事 */
  updated: StoredEvent[];
  /** 解析器已更新，但無法重新解析的賽事 ID（沒有原始檔，或重新解析失敗） */
  stale: string[];
}

/**
 * 解析器版本和保存時不同的賽事，用保存的原始檔重新解析。
 * 沿用原本的賽事 ID、名稱與匯入時間，報告連結與同標題分開保存的結果都不會變。
 */
export async function refreshEvents(
  stored: StoredEvent[],
  version: string,
  parse: (data: Uint8Array, fileName: string) => Promise<ParsedEvent>,
): Promise<RefreshResult> {
  const events: StoredEvent[] = [];
  const updated: StoredEvent[] = [];
  const stale: string[] = [];
  for (const s of stored) {
    if (s.parserVersion === version) {
      events.push(s);
      continue;
    }
    const old = s.parsed.event;
    if (!s.data) {
      events.push(s);
      stale.push(old.eventId);
      continue;
    }
    try {
      const fresh = renameEvent(await parse(s.data, old.fileName), old.eventId, old.name);
      const next: StoredEvent = { parsed: { ...fresh, event: { ...fresh.event, importedAt: old.importedAt } }, data: s.data, parserVersion: version };
      events.push(next);
      updated.push(next);
    } catch (err) {
      console.error(err);
      events.push(s);
      stale.push(old.eventId);
    }
  }
  return { events, updated, stale };
}
