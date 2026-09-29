import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, categoryBreakdown, formatRupees } from '../src/totals.js';

const now = new Date(2026, 8, 15, 12, 0, 0);
const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();

test('empty entries give zero totals', () => {
  assert.deepEqual(computeTotals([], now), { today: 0, month: 0 });
});

test('splits today, earlier this month, and previous month', () => {
  const entries = [
    { id: 'a', amount: 120, note: 'chai', createdAt: at(2026, 8, 15, 9) },
    { id: 'b', amount: 50, note: 'bus', createdAt: at(2026, 8, 3) },
    { id: 'c', amount: 999, note: 'old', createdAt: at(2026, 7, 31, 23) },
    { id: 'd', amount: 7, note: 'next', createdAt: at(2026, 9, 1, 0) },
  ];
  assert.deepEqual(computeTotals(entries, now), { today: 120, month: 170 });
});

test('sums are exact to the paisa', () => {
  const entries = [
    { id: 'a', amount: 0.1, note: '', createdAt: now.getTime() },
    { id: 'b', amount: 0.2, note: '', createdAt: now.getTime() },
  ];
  assert.deepEqual(computeTotals(entries, now), { today: 0.3, month: 0.3 });
});

test('rejects malformed input with a TypeError', () => {
  const good = { id: 'a', amount: 1, note: '', createdAt: now.getTime() };
  assert.throws(() => computeTotals(null, now), TypeError);
  assert.throws(() => computeTotals(undefined, now), TypeError);
  assert.throws(() => computeTotals([good], undefined), TypeError);
  assert.throws(() => computeTotals([good], new Date('nope')), TypeError);
  assert.throws(() => computeTotals([null], now), /entries\[0\]/);
  assert.throws(() => computeTotals([{ ...good, amount: '5' }], now), /amount/);
  assert.throws(() => computeTotals([{ ...good, amount: NaN }], now), /amount/);
  assert.throws(() => computeTotals([good, { ...good, createdAt: undefined }], now), /entries\[1\]\.createdAt/);
});

test('categoryBreakdown sums to the month total and excludes other months', () => {
  const entries = [
    { id: 'a', amount: 120, note: 'chai', createdAt: at(2026, 8, 15, 9) },
    { id: 'b', amount: 50, note: 'bus', createdAt: at(2026, 8, 3) },
    { id: 'c', amount: 30.1, note: 'lunch', createdAt: at(2026, 8, 4) },
    { id: 'd', amount: 0.2, note: 'mystery', createdAt: at(2026, 8, 5) },
    { id: 'e', amount: 999, note: 'chai', createdAt: at(2026, 7, 31, 23) },
    { id: 'f', amount: 7, note: 'bus', createdAt: at(2026, 9, 1, 0) },
  ];
  const result = categoryBreakdown(entries, now);
  assert.deepEqual(result, [
    { category: 'Food', total: 150.1 },
    { category: 'Transport', total: 50 },
    { category: 'Other', total: 0.2 },
  ]);
  const sum = result.reduce((s, r) => s + Math.round(r.total * 100), 0) / 100;
  assert.equal(sum, computeTotals(entries, now).month);
});

test('categoryBreakdown breaks ties by category name ascending', () => {
  const entries = [
    { id: 'a', amount: 10, note: 'bus', createdAt: at(2026, 8, 2) },
    { id: 'b', amount: 10, note: 'chai', createdAt: at(2026, 8, 2) },
    { id: 'c', amount: 10, note: 'milk', createdAt: at(2026, 8, 2) },
  ];
  assert.deepEqual(categoryBreakdown(entries, now).map((r) => r.category), ['Food', 'Groceries', 'Transport']);
});

test('categoryBreakdown returns [] with no current-month entries', () => {
  assert.deepEqual(categoryBreakdown([], now), []);
  const old = [{ id: 'a', amount: 5, note: 'chai', createdAt: at(2026, 7, 1) }];
  assert.deepEqual(categoryBreakdown(old, now), []);
});

test('formatRupees uses en-IN grouping with two decimals', () => {
  assert.equal(formatRupees(1234.5), '₹1,234.50');
  assert.equal(formatRupees(1234567.891), '₹12,34,567.89');
  assert.equal(formatRupees(0), '₹0.00');
});
