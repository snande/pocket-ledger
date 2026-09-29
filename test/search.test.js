import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchEntries } from '../src/search.js';

const at = (y, m, d) => new Date(y, m, d, 12).getTime();

const entries = [
  { id: 'a', amount: 10, note: 'chai', createdAt: at(2026, 6, 1) },
  { id: 'b', amount: 20, note: 'Chai', createdAt: at(2026, 8, 2) },
  { id: 'c', amount: 30, note: 'masala chai', createdAt: at(2026, 7, 3) },
  { id: 'd', amount: 40, note: 'coffee', createdAt: at(2026, 8, 4) },
];

test('matches case-insensitively and excludes non-matches', () => {
  const ids = searchEntries(entries, 'chai').map((e) => e.id);
  assert.deepEqual(ids, ['b', 'c', 'a']);
});

test('trims the query; empty or whitespace query returns []', () => {
  assert.equal(searchEntries(entries, '  chai  ').length, 3);
  assert.deepEqual(searchEntries(entries, ''), []);
  assert.deepEqual(searchEntries(entries, '   '), []);
});

test('orders newest first across months, ties broken by id', () => {
  const tied = [
    { id: 'y', amount: 1, note: 'chai', createdAt: 5 },
    { id: 'x', amount: 1, note: 'chai', createdAt: 5 },
    { id: 'z', amount: 1, note: 'chai', createdAt: 9 },
  ];
  assert.deepEqual(searchEntries(tied, 'chai').map((e) => e.id), ['z', 'x', 'y']);
});

test('does not mutate the input array', () => {
  const copy = entries.slice();
  searchEntries(entries, 'chai');
  assert.deepEqual(entries, copy);
  assert.equal(entries.length, 4);
});
