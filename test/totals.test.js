import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, formatRupees } from '../src/totals.js';

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

test('formatRupees uses en-IN grouping with two decimals', () => {
  assert.equal(formatRupees(1234.5), '₹1,234.50');
  assert.equal(formatRupees(1234567.891), '₹12,34,567.89');
  assert.equal(formatRupees(0), '₹0.00');
});
