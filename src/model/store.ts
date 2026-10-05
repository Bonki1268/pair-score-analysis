import type { ParsedEvent } from './types';
import type { AliasMap } from '../index/players';

// 已匯入的賽事留在使用者本機的 IndexedDB；瀏覽器不支援或被封鎖時退回記憶體，只是重新整理後要重新上傳
const DB_NAME = 'pair-score-analysis';
const DB_VERSION = 1;
const EVENTS = 'events';
const SETTINGS = 'settings';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = { events: new Map<string, ParsedEvent>(), aliases: {} as AliasMap };

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS);
        if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
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

export async function loadAliases(): Promise<AliasMap> {
  const db = await open();
  if (!db) return memory.aliases;
  try {
    return ((await tx(db, SETTINGS, 'readonly', (s) => s.get('aliases'))) as AliasMap | undefined) ?? {};
  } catch {
    return memory.aliases;
  }
}

export async function saveAliases(aliases: AliasMap): Promise<void> {
  memory.aliases = aliases;
  const db = await open();
  if (!db) return;
  try {
    await tx(db, SETTINGS, 'readwrite', (s) => s.put(aliases, 'aliases'));
  } catch {
    /* 退回記憶體 */
  }
}
