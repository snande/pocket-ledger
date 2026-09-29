import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage.js';

const {
  openStore,
  closeStore,
  addEntry,
  listEntries,
  deleteEntry,
  clearAll,
  isPersisted,
  version,
} = storage;

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function stubNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

function restoreNavigator() {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
}

function stubIndexedDB(value) {
  Object.defineProperty(globalThis, 'indexedDB', { value, configurable: true, writable: true });
}

function restoreIndexedDB() {
  Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB);
}

beforeEach(async () => {
  restoreNavigator();
  restoreIndexedDB();
  await openStore();
  await clearAll();
});

test('exports the documented API', () => {
  for (const name of ['openStore', 'addEntry', 'listEntries', 'deleteEntry', 'clearAll', 'isPersisted']) {
    assert.equal(typeof storage[name], 'function', name);
  }
  assert.equal(typeof version, 'number');
  assert.equal(storage.DB_NAME, 'pocket-ledger');
  assert.equal(storage.STORE_NAME, 'entries');
});

test('uses the pocket-ledger database with an id-keyed entries store', async () => {
  const db = await openStore();
  assert.equal(db.name, 'pocket-ledger');
  assert.equal(db.version, version);
  const tx = db.transaction('entries', 'readonly');
  assert.equal(tx.objectStore('entries').keyPath, 'id');
});

test('addEntry returns the stored entry with a generated string id', async () => {
  const createdAt = Date.now();
  const entry = await addEntry({ amount: 120, note: 'chai', category: 'food', createdAt });
  assert.equal(typeof entry.id, 'string');
  assert.ok(entry.id.length > 0);
  assert.deepEqual({ ...entry, id: undefined }, {
    id: undefined,
    amount: 120,
    note: 'chai',
    category: 'food',
    createdAt,
  });
  const other = await addEntry({ amount: 1, note: 'x', category: 'y', createdAt });
  assert.notEqual(other.id, entry.id);
});

test('addEntry defaults createdAt to now and rejects non-numeric timestamps', async () => {
  const before = Date.now();
  const entry = await addEntry({ amount: 5, note: 'n', category: 'c' });
  assert.ok(entry.createdAt >= before && entry.createdAt <= Date.now());

  for (const bad of ['2026-09-28T00:00:00Z', NaN, Infinity, null, new Date()]) {
    await assert.rejects(
      addEntry({ amount: 1, note: 'n', category: 'c', createdAt: bad }),
      TypeError,
    );
  }
  assert.equal((await listEntries()).length, 1);
});

test('entries survive closing and reopening the database', async () => {
  const createdAt = Date.now();
  const added = await addEntry({ amount: 120, note: 'chai', category: 'food', createdAt });
  await closeStore();
  await openStore();
  const entries = await listEntries();
  assert.deepEqual(entries, [added]);
});

test('amount, note and category round-trip unchanged', async () => {
  await addEntry({ amount: 120, note: 'chai', category: 'food', createdAt: 1 });
  await addEntry({ amount: 0.1, note: '  spaced ünïcode ₹  ', category: 'Misc', createdAt: 2 });
  await closeStore();
  const [a, b] = await listEntries();
  assert.equal(a.amount, 120);
  assert.equal(a.note, 'chai');
  assert.equal(a.category, 'food');
  assert.equal(b.amount, 0.1);
  assert.equal(b.note, '  spaced ünïcode ₹  ');
  assert.equal(b.category, 'Misc');
});

test('listEntries orders by createdAt ascending', async () => {
  await addEntry({ amount: 3, note: 'c', category: 'x', createdAt: 300 });
  await addEntry({ amount: 1, note: 'a', category: 'x', createdAt: 100 });
  await addEntry({ amount: 2, note: 'b', category: 'x', createdAt: 200 });
  const entries = await listEntries();
  assert.deepEqual(entries.map((e) => e.createdAt), [100, 200, 300]);
});

test('deleteEntry removes only the given entry', async () => {
  const keep = await addEntry({ amount: 1, note: 'keep', category: 'x', createdAt: 1 });
  const drop = await addEntry({ amount: 2, note: 'drop', category: 'x', createdAt: 2 });
  await deleteEntry(drop.id);
  assert.deepEqual(await listEntries(), [keep]);
});

test('clearAll empties the store', async () => {
  await addEntry({ amount: 1, note: 'a', category: 'x', createdAt: 1 });
  await addEntry({ amount: 2, note: 'b', category: 'x', createdAt: 2 });
  await clearAll();
  assert.deepEqual(await listEntries(), []);
});

test('concurrent openStore calls share one connection', async () => {
  await closeStore();
  let opens = 0;
  const realOpen = indexedDB.open.bind(indexedDB);
  const realIndexedDB = indexedDB;
  stubIndexedDB({
    open: (...args) => {
      opens++;
      return realOpen(...args);
    },
  });
  try {
    const [a, b, c] = await Promise.all([openStore(), openStore(), openStore()]);
    assert.equal(a, b);
    assert.equal(b, c);
    assert.equal(opens, 1);
    await addEntry({ amount: 1, note: 'n', category: 'c', createdAt: 1 });
    assert.equal(opens, 1);
  } finally {
    stubIndexedDB(realIndexedDB);
  }
});

test('a failed open rejects every concurrent caller and the next call reconnects', async () => {
  await closeStore();
  let opens = 0;
  stubIndexedDB({
    open: () => {
      opens++;
      const request = {};
      setTimeout(() => {
        request.error = new Error('open failed');
        request.onerror();
      }, 0);
      return request;
    },
  });
  const results = await Promise.allSettled([openStore(), openStore()]);
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  assert.equal(opens, 1);

  restoreIndexedDB();
  const db = await openStore();
  assert.equal(db.name, 'pocket-ledger');
  await addEntry({ amount: 1, note: 'n', category: 'c', createdAt: 1 });
  assert.equal((await listEntries()).length, 1);
});

test('openStore requests persistent storage when available', async () => {
  let calls = 0;
  stubNavigator({ storage: { persist: async () => (calls++, true), persisted: async () => true } });
  await closeStore();
  await openStore();
  assert.equal(calls, 1);
  assert.equal(await isPersisted(), true);
});

test('openStore does not throw when persistence is denied or rejects', async () => {
  stubNavigator({ storage: { persist: async () => false, persisted: async () => false } });
  await closeStore();
  await openStore();
  assert.equal(await isPersisted(), false);

  stubNavigator({
    storage: {
      persist: () => Promise.reject(new Error('denied')),
      persisted: () => Promise.reject(new Error('denied')),
    },
  });
  await closeStore();
  await openStore();
  assert.equal(await isPersisted(), false);

  stubNavigator({
    storage: {
      persist: () => {
        throw new Error('sync failure');
      },
    },
  });
  await closeStore();
  await openStore();
});

test('openStore and isPersisted work when the storage API is absent', async () => {
  stubNavigator({});
  await closeStore();
  await openStore();
  assert.equal(await isPersisted(), false);

  stubNavigator(undefined);
  await closeStore();
  await openStore();
  assert.equal(await isPersisted(), false);
});

test('putEntries inserts new entries and overwrites an existing id', async () => {
  const a = await storage.addEntry({ amount: 1, note: 'a', category: 'Other', createdAt: 1 });
  await storage.putEntries([
    { ...a, amount: 5 },
    { id: 'b', amount: 2, note: 'b', category: 'Other', createdAt: 2 },
  ]);
  const rows = await storage.listEntries();
  assert.deepEqual(rows.map((r) => [r.id, r.amount]), [[a.id, 5], ['b', 2]]);
});
