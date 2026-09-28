import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitQuickEntry, formatAmount, formatEntry, ERROR_MESSAGE } from '../src/app.js';
import { createMemoryStore } from '../src/store.js';

test('submitQuickEntry stores and returns a categorised entry', async () => {
  const store = createMemoryStore();
  const now = new Date(2026, 8, 28, 9, 30);
  const entry = await submitQuickEntry('120 chai', store, now);
  assert.equal(entry.amount, 120);
  assert.equal(entry.label, 'chai');
  assert.equal(entry.category, 'Food');
  assert.equal(entry.createdAt, now.toISOString());
  assert.deepEqual(await store.listEntriesForDay(now), [entry]);
});

test('submitQuickEntry returns null and stores nothing for rejected input', async () => {
  const store = createMemoryStore();
  const now = new Date(2026, 8, 28, 9, 30);
  for (const text of ['', '   ', 'chai', '120', '0 chai']) {
    assert.equal(await submitQuickEntry(text, store, now), null, JSON.stringify(text));
  }
  assert.deepEqual(await store.listEntriesForDay(now), []);
});

test('submitQuickEntry falls back to Other for unknown labels', async () => {
  const store = createMemoryStore();
  const entry = await submitQuickEntry('50 gift', store, new Date());
  assert.equal(entry.category, 'Other');
});

test('formatAmount prefixes ₹ and uses en-IN grouping', () => {
  assert.equal(formatAmount(120), '₹120');
  assert.equal(formatAmount(1200), '₹1,200');
  assert.equal(formatAmount(100000), '₹1,00,000');
});

test('formatEntry includes amount, label and category', () => {
  const text = formatEntry({ amount: 120, label: 'chai', category: 'Food' });
  assert.match(text, /₹120/);
  assert.match(text, /chai/);
  assert.match(text, /Food/);
});

test('error message tells the user to use a format like 120 chai', () => {
  assert.match(ERROR_MESSAGE, /120 chai/);
});
