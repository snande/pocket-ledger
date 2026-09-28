import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/store.js';

test('addEntry resolves to an entry with id and ISO createdAt', async () => {
  const store = createMemoryStore();
  const pending = store.addEntry({ amount: 120, label: 'chai', category: 'Food' });
  assert.ok(pending instanceof Promise);
  const entry = await pending;
  assert.equal(typeof entry.id, 'string');
  assert.ok(entry.id.length > 0);
  assert.equal(entry.amount, 120);
  assert.equal(entry.label, 'chai');
  assert.equal(entry.category, 'Food');
  assert.equal(new Date(entry.createdAt).toISOString(), entry.createdAt);
});

test('addEntry gives each entry a distinct id', async () => {
  const store = createMemoryStore();
  const a = await store.addEntry({ amount: 1, label: 'a', category: 'Other' });
  const b = await store.addEntry({ amount: 2, label: 'b', category: 'Other' });
  assert.notEqual(a.id, b.id);
});

test('listEntriesForDay returns a Promise of entries newest first', async () => {
  const store = createMemoryStore();
  const day = (h) => new Date(2026, 8, 28, h).toISOString();
  await store.addEntry({ amount: 1, label: 'early', category: 'Other', createdAt: day(8) });
  await store.addEntry({ amount: 2, label: 'late', category: 'Other', createdAt: day(20) });
  await store.addEntry({ amount: 3, label: 'mid', category: 'Other', createdAt: day(12) });
  const list = store.listEntriesForDay(new Date(2026, 8, 28, 23));
  assert.ok(list instanceof Promise);
  assert.deepEqual((await list).map((e) => e.label), ['late', 'mid', 'early']);
});

test('listEntriesForDay keeps only the local calendar day', async () => {
  const store = createMemoryStore();
  await store.addEntry({
    amount: 1, label: 'yesterday', category: 'Other',
    createdAt: new Date(2026, 8, 27, 23, 59).toISOString(),
  });
  await store.addEntry({
    amount: 2, label: 'start', category: 'Other',
    createdAt: new Date(2026, 8, 28, 0, 0).toISOString(),
  });
  await store.addEntry({
    amount: 3, label: 'tomorrow', category: 'Other',
    createdAt: new Date(2026, 8, 29, 0, 0).toISOString(),
  });
  const list = await store.listEntriesForDay(new Date(2026, 8, 28, 15));
  assert.deepEqual(list.map((e) => e.label), ['start']);
});

test('entries with identical timestamps list latest-added first', async () => {
  const store = createMemoryStore();
  const createdAt = new Date(2026, 8, 28, 10).toISOString();
  await store.addEntry({ amount: 1, label: 'first', category: 'Other', createdAt });
  await store.addEntry({ amount: 2, label: 'second', category: 'Other', createdAt });
  const list = await store.listEntriesForDay(new Date(2026, 8, 28));
  assert.deepEqual(list.map((e) => e.label), ['second', 'first']);
});

test('addEntry without createdAt stamps the current time', async () => {
  const store = createMemoryStore();
  await store.addEntry({ amount: 5, label: 'now', category: 'Other' });
  const list = await store.listEntriesForDay(new Date());
  assert.equal(list.length, 1);
});
