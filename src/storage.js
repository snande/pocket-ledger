export const DB_NAME = 'pocket-ledger';
export const STORE_NAME = 'entries';
export const version = 1;

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestPersistence() {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (storage && typeof storage.persist === 'function') {
      Promise.resolve(storage.persist()).catch(() => {});
    }
  } catch {
    // persistence is best-effort; never surface a failure
  }
}

function connect() {
  const promise = new Promise((resolve, reject) => {
    // Drop the cached promise synchronously, before settling, so a caller that
    // retries right after a failure always starts a fresh connection.
    const forget = () => {
      if (dbPromise === promise) dbPromise = null;
    };
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = forget;
      db.onversionchange = () => {
        db.close();
        forget();
      };
      resolve(db);
    };
    request.onerror = () => {
      forget();
      reject(request.error);
    };
  });
  return promise;
}

export async function openStore() {
  requestPersistence();
  if (!dbPromise) dbPromise = connect();
  return dbPromise;
}

export async function closeStore() {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // open already failed; nothing to close
  }
}

async function withStore(mode, work) {
  const db = await openStore();
  const tx = db.transaction(STORE_NAME, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
  const result = await work(tx.objectStore(STORE_NAME));
  await done;
  return result;
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// createdAt must be a finite numeric timestamp (ms since epoch); listEntries sorts on it.
export async function addEntry({ amount, note, category, createdAt } = {}) {
  const timestamp = createdAt === undefined ? Date.now() : createdAt;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    throw new TypeError('createdAt must be a finite numeric timestamp');
  }
  const entry = { id: generateId(), amount, note, category, createdAt: timestamp };
  await withStore('readwrite', (store) => requestToPromise(store.add(entry)));
  return entry;
}

export async function listEntries() {
  const entries = await withStore('readonly', (store) => requestToPromise(store.getAll()));
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteEntry(id) {
  await withStore('readwrite', (store) => requestToPromise(store.delete(id)));
}

// Upserts every entry (by id) in one readwrite transaction, so a bulk write is all-or-nothing.
export async function putEntries(entries) {
  await withStore('readwrite', async (store) => {
    await Promise.all(entries.map((entry) => requestToPromise(store.put(entry))));
  });
}

export async function clearAll() {
  await withStore('readwrite', (store) => requestToPromise(store.clear()));
}

export async function isPersisted() {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (storage && typeof storage.persisted === 'function') {
      return (await storage.persisted()) === true;
    }
  } catch {
    // fall through to false
  }
  return false;
}
