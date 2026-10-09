import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedEvent } from '../src/model/types';
import { parseRoute, reportHref } from '../src/ui/search';

describe('報告網址', () => {
  test('reportHref 與 parseRoute 互為反向', () => {
    const params = { name: '王小明', event: '115年 大專橋藝錦標賽 學生組', team: '115年 大專橋藝錦標賽 學生組#3', partner: '陳大華' };
    expect(parseRoute(reportHref(params.name, params))).toEqual(params);
  });
  test('% 編碼不完整（網址被截斷）時不會丟出錯誤', () => {
    expect(parseRoute('#/p/%E7%8E')).toEqual({ name: '%E7%8E', event: undefined, team: undefined, partner: undefined });
  });
  test('不是報告頁', () => {
    expect(parseRoute('#/')).toBeNull();
  });
});

const stored = { parsed: { event: { eventId: 'A' } } as ParsedEvent, data: null, parserVersion: null };

/** 模擬 IndexedDB：請求本身成功，交易提交時才因空間不足中止 */
function quotaIndexedDB() {
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const t: Record<string, unknown> = { error: new DOMException('quota', 'QuotaExceededError') };
      t.objectStore = () => ({
        put: () => {
          const req: Record<string, unknown> = { result: 'A', error: null };
          setTimeout(() => {
            (req.onsuccess as (() => void) | undefined)?.();
            (t.onabort as () => void)();
          });
          return req;
        },
      });
      return t;
    },
  };
  return {
    open: () => {
      const req: Record<string, unknown> = { result: db };
      setTimeout(() => (req.onsuccess as () => void)());
      return req;
    },
  };
}

describe('存進瀏覽器失敗時回報', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test('沒有 IndexedDB（無痕模式或被封鎖）', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const store = await import('../src/model/store');
    expect(await store.storageAvailable()).toBe(false);
    expect(await store.saveEvent(stored)).toBe(false);
  });

  test('請求成功但交易因空間不足中止，不算存好', async () => {
    vi.stubGlobal('indexedDB', quotaIndexedDB());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = await import('../src/model/store');
    expect(await store.storageAvailable()).toBe(true);
    expect(await store.saveEvent(stored)).toBe(false);
  });
});
