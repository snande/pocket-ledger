import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthlyComparison } from '../src/monthly.js';

const now = new Date(2026, 8, 15, 12, 0, 0);
const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();

test('compares two seeded months per category', () => {
  const entries = [
    { id: '1', amount: 100, note: 'chai', createdAt: at(2026, 8, 2) },
    { id: '2', amount: 50, note: 'lunch', createdAt: at(2026, 8, 3) },
    { id: '3', amount: 100, note: 'bus', createdAt: at(2026, 8, 4) },
    { id: '4', amount: 100, note: 'chai', createdAt: at(2026, 7, 10) },
    { id: '5', amount: 40, note: 'rent', createdAt: at(2026, 7, 11) },
    { id: '6', amount: 999, note: 'chai', createdAt: at(2026, 6, 31) },
    { id: '7', amount: 999, note: 'chai', createdAt: at(2026, 9, 1, 0) },
  ];
  assert.deepEqual(monthlyComparison(entries, now), {
    year: 2026,
    month: 8,
    categories: [
      { category: 'Food', total: 150, previousTotal: 100, change: 50, changePercent: 50 },
      { category: 'Transport', total: 100, previousTotal: 0, change: 100, changePercent: null },
      { category: 'Bills', total: 0, previousTotal: 40, change: -40, changePercent: -100 },
    ],
  });
});

test('ties on total are broken by category name ascending', () => {
  const entries = [
    { id: '1', amount: 10, note: 'bus', createdAt: at(2026, 8, 1) },
    { id: '2', amount: 10, note: 'chai', createdAt: at(2026, 8, 1) },
    { id: '3', amount: 10, note: 'milk', createdAt: at(2026, 8, 1) },
  ];
  assert.deepEqual(
    monthlyComparison(entries, now).categories.map((c) => c.category),
    ['Food', 'Groceries', 'Transport'],
  );
});

test('January compares against December of the prior year', () => {
  const jan = new Date(2026, 0, 10);
  const entries = [
    { id: '1', amount: 30, note: 'chai', createdAt: at(2026, 0, 5) },
    { id: '2', amount: 60, note: 'chai', createdAt: at(2025, 11, 20) },
    { id: '3', amount: 500, note: 'chai', createdAt: at(2025, 10, 20) },
  ];
  const result = monthlyComparison(entries, jan);
  assert.equal(result.year, 2026);
  assert.equal(result.month, 0);
  assert.deepEqual(result.categories, [
    { category: 'Food', total: 30, previousTotal: 60, change: -30, changePercent: -50 },
  ]);
});

test('empty entries give no categories', () => {
  assert.deepEqual(monthlyComparison([], now), { year: 2026, month: 8, categories: [] });
});

test('rejects invalid input', () => {
  assert.throws(() => monthlyComparison('x', now), TypeError);
  assert.throws(() => monthlyComparison([], new Date(NaN)), TypeError);
  assert.throws(() => monthlyComparison([{ amount: 'a', createdAt: 1 }], now), TypeError);
});

test('module stays free of DOM and storage references', () => {
  const src = readFileSync(new URL('../src/monthly.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
});
