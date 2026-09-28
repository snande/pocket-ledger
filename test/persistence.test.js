import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage.js';
import {
  computeTotals,
  createStorageStore,
  hydrate,
  submitQuickEntry,
} from '../src/app.js';

beforeEach(async () => {
  await storage.openStore();
  await storage.clearAll();
});

test('computeTotals is exported from app.js and uses local day and month', () => {
  const now = new Date(2026, 8, 28, 12);
  const entries = [
    { amount: 100, createdAt: new Date(2026, 8, 28, 0, 0).getTime() },
    { amount: 50.5, createdAt: new Date(2026, 8, 3, 23, 59).getTime() },
    { amount: 7, createdAt: new Date(2026, 7, 31, 23, 59).getTime() },
    { amount: 9, createdAt: new Date(2026, 9, 1, 0, 0).getTime() },
  ];
  assert.deepEqual(computeTotals(entries, now), { today: 100, month: 150.5 });
});

test('entries added through the storage store are hydrated back, with totals', async () => {
  const store = createStorageStore(storage);
  const now = new Date();
  const first = await submitQuickEntry('120 chai', store, now);
  assert.equal(first.label, 'chai');
  assert.equal(first.amount, 120);

  // Closing the connection and reading through a fresh store stands in for reopening the page.
  await storage.closeStore();
  const reopened = createStorageStore(storage);
  let shown = null;
  await hydrate(reopened, (entries) => {
    shown = entries;
  });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].id, first.id);
  assert.equal(shown[0].label, 'chai');
  assert.equal(shown[0].category, 'Food');
  assert.deepEqual(computeTotals(shown, now), { today: 120, month: 120 });
});

test('hydrate hands every stored entry to the renderer, newest first, across days', async () => {
  const store = createStorageStore(storage);
  await store.addEntry({ amount: 1, label: 'old', category: 'Other', createdAt: 100 });
  await store.addEntry({ amount: 2, label: 'new', category: 'Other', createdAt: 200 });
  let shown = null;
  await hydrate(store, (entries) => {
    shown = entries;
  });
  assert.deepEqual(shown.map((e) => e.label), ['new', 'old']);
});

test('a failed write rejects and stores nothing', async () => {
  const failing = createStorageStore({
    addEntry: async () => {
      throw new Error('disk full');
    },
    listEntries: storage.listEntries,
    deleteEntry: storage.deleteEntry,
  });
  await assert.rejects(submitQuickEntry('120 chai', failing, new Date()), /disk full/);
  assert.deepEqual(await storage.listEntries(), []);
});

test('an unparseable createdAt is rejected before anything is written', async () => {
  const store = createStorageStore(storage);
  await assert.rejects(
    store.addEntry({ amount: 5, label: 'x', category: 'Other', createdAt: 'not a date' }),
    TypeError,
  );
  assert.deepEqual(await storage.listEntries(), []);
});
