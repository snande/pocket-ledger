import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate } from '../src/format.js';

test('formatDate formats an ISO string, epoch ms and a Date-derived number', () => {
  const local = new Date(2026, 2, 12, 12);
  assert.equal(formatDate(local.toISOString()), '12 Mar 2026');
  assert.equal(formatDate(local.getTime()), '12 Mar 2026');
});

test('formatDate returns an empty string for invalid input', () => {
  for (const bad of ['nope', '', null, undefined, NaN, Infinity, {}]) {
    assert.equal(formatDate(bad), '');
  }
});
