import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry } from '../src/parse.js';

test('parses amount-first entry', () => {
  assert.deepEqual(parseEntry('120 chai'), { amount: 120, label: 'chai' });
});

test('accepts ₹ and Rs prefixes', () => {
  assert.deepEqual(parseEntry('₹450 petrol'), { amount: 450, label: 'petrol' });
  assert.deepEqual(parseEntry('Rs 450 petrol'), { amount: 450, label: 'petrol' });
  assert.deepEqual(parseEntry('rs.450 petrol'), { amount: 450, label: 'petrol' });
});

test('accepts amount at the end', () => {
  assert.deepEqual(parseEntry('petrol 450'), { amount: 450, label: 'petrol' });
  assert.deepEqual(parseEntry('petrol ₹450'), { amount: 450, label: 'petrol' });
  assert.deepEqual(parseEntry('petrol Rs 450'), { amount: 450, label: 'petrol' });
});

test('accepts up to two decimal places', () => {
  assert.deepEqual(parseEntry('80.50 auto'), { amount: 80.5, label: 'auto' });
  assert.equal(parseEntry('80.555 auto'), null);
});

test('returns null for empty or whitespace-only input', () => {
  assert.equal(parseEntry(''), null);
  assert.equal(parseEntry('   '), null);
});

test('returns null when there is no numeric amount', () => {
  assert.equal(parseEntry('chai'), null);
});

test('returns null for zero amounts', () => {
  assert.equal(parseEntry('0 chai'), null);
  assert.equal(parseEntry('0.00 chai'), null);
});

test('returns null when there is no label', () => {
  assert.equal(parseEntry('120'), null);
  assert.equal(parseEntry('₹120'), null);
  assert.equal(parseEntry('  120  '), null);
});

test('returns null for non-string input', () => {
  assert.equal(parseEntry(undefined), null);
  assert.equal(parseEntry(null), null);
  assert.equal(parseEntry(120), null);
});

test('trims label and collapses internal whitespace', () => {
  assert.deepEqual(parseEntry('  120   masala  chai '), { amount: 120, label: 'masala chai' });
});

test('amount-first wins when both ends are numeric', () => {
  assert.deepEqual(parseEntry('120 chai 50'), { amount: 120, label: 'chai 50' });
});

test('digits inside a trailing-amount label stay in the label', () => {
  assert.deepEqual(parseEntry('trip 2 950'), { amount: 950, label: 'trip 2' });
});
