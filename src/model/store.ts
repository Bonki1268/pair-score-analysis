import type { ParsedEvent } from './types';

// 已匯入的賽事留在使用者本機的 IndexedDB；瀏覽器不支援或被封鎖時退回記憶體，只是重新整理後要重新上傳
const DB_NAME = 'pair-score-analysis';
const DB_VERSION = 1;
const EVENTS = 'events';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = { events: new Map<string, ParsedEvent>() };

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

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadEvents(): Promise<ParsedEvent[]> {
  const db = await open();
  if (!db) return [...memory.events.values()];
  try {
    return await tx<ParsedEvent[]>(db, EVENTS, 'readonly', (s) => s.getAll());
  } catch {
    return [...memory.events.values()];
  }
}

export async function saveEvent(e: ParsedEvent): Promise<void> {
  memory.events.set(e.event.eventId, e);
  const db = await open();
  if (!db) return;
  try {
    await tx(db, EVENTS, 'readwrite', (s) => s.put(e, e.event.eventId));
  } catch {
    /* 退回記憶體 */
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
