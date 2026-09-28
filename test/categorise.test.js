import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorise, CATEGORY_KEYWORDS } from '../src/categorise.js';

test('maps required keywords', () => {
  assert.equal(categorise('chai'), 'Food');
  assert.equal(categorise('petrol'), 'Transport');
  assert.equal(categorise('auto'), 'Transport');
});

test('covers the documented keyword table', () => {
  assert.equal(categorise('milk'), 'Groceries');
  assert.equal(categorise('recharge'), 'Bills');
  assert.equal(categorise('metro'), 'Transport');
  assert.equal(categorise('breakfast'), 'Food');
  assert.ok(Array.isArray(CATEGORY_KEYWORDS.Food));
});

test('matching is case-insensitive', () => {
  assert.equal(categorise('CHAI'), 'Food');
  assert.equal(categorise('Petrol'), 'Transport');
});

test('matches whole words inside multi-word labels', () => {
  assert.equal(categorise('masala chai'), 'Food');
});

test('does not match keywords inside longer words', () => {
  assert.equal(categorise('automatic'), 'Other');
});

test('unknown or non-string labels map to Other', () => {
  assert.equal(categorise('gizmo'), 'Other');
  assert.equal(categorise(''), 'Other');
  assert.equal(categorise(undefined), 'Other');
});
