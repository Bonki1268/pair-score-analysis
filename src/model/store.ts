import type { ParsedEvent } from './types';

// 已匯入的賽事留在使用者本機的 IndexedDB；瀏覽器不支援或被封鎖時退回記憶體，只是重新整理後要重新上傳
const DB_NAME = 'pair-score-analysis';
const DB_VERSION = 1;
const EVENTS = 'events';

/** 一份已匯入的賽事：解析結果，加上重新解析用的原始檔與解析器版本 */
export interface StoredEvent {
  parsed: ParsedEvent;
  /** 原始檔內容；早期版本沒有保存，為 null */
  data: Uint8Array | null;
  /** 解析時的解析器版本；早期版本沒有記錄，為 null */
  parserVersion: string | null;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = { events: new Map<string, StoredEvent>() };

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/**
 * 等交易完成（oncomplete）才算成功：空間不足（QuotaExceededError）常常是請求本身成功、
 * 交易提交時才中止，只看請求的 onsuccess 會誤以為已經存好
 */
function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onabort = () => reject(t.error ?? req.error);
    t.onerror = () => reject(t.error ?? req.error);
  });
}

/** 瀏覽器能不能保存賽事（無痕模式或封鎖網站資料時不行） */
export async function storageAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

/** 早期版本直接存 ParsedEvent，沒有原始檔與版本 */
function normalize(rec: StoredEvent | ParsedEvent): StoredEvent {
  return 'parsed' in rec ? rec : { parsed: rec, data: null, parserVersion: null };
}

export async function loadEvents(): Promise<StoredEvent[]> {
  const db = await open();
  if (!db) return [...memory.events.values()];
  try {
    return (await tx<(StoredEvent | ParsedEvent)[]>(db, EVENTS, 'readonly', (s) => s.getAll())).map(normalize);
  } catch {
    return [...memory.events.values()];
  }
}

/** 存進瀏覽器；回傳 false 表示只留在記憶體，重新整理後就不見了 */
export async function saveEvent(e: StoredEvent): Promise<boolean> {
  const id = e.parsed.event.eventId;
  memory.events.set(id, e);
  const db = await open();
  if (!db) return false;
  try {
    await tx(db, EVENTS, 'readwrite', (s) => s.put(e, id));
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  memory.events.delete(eventId);
  const db = await open();
  if (!db) return;
  try {
    await tx(db, EVENTS, 'readwrite', (s) => s.delete(eventId));
  } catch {
    /* 退回記憶體 */
  }
}
