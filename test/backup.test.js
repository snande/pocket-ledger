import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, backupFilename } from '../src/backup.js';

const now = new Date(2026, 8, 5, 12, 0, 0);

test('serializes the backup envelope with entries in order', () => {
  const entries = [
    { id: 'a', amount: 120.5, note: 'chai', createdAt: 1000, category: 'food' },
    { id: 'b', amount: 50, note: 'bus', createdAt: 2000 },
  ];
  const text = serializeBackup(entries, now.getTime());
  assert.equal(text, JSON.stringify(JSON.parse(text), null, 2));
  assert.deepEqual(JSON.parse(text), {
    app: 'pocket-ledger',
    version: 1,
    exportedAt: now.getTime(),
    entries,
  });
});

test('each entry keeps id, amount, note, createdAt and extra fields', () => {
  const entry = { id: 'x', amount: 99.25, note: 'lunch', createdAt: 3000, tag: 'work' };
  const [out] = JSON.parse(serializeBackup([entry], now)).entries;
  assert.equal(out.id, 'x');
  assert.equal(out.amount, 99.25);
  assert.equal(out.note, 'lunch');
  assert.equal(out.createdAt, 3000);
  assert.equal(out.tag, 'work');
});

test('accepts a Date for now', () => {
  assert.equal(JSON.parse(serializeBackup([], now)).exportedAt, now.getTime());
});

test('empty entries give a valid backup', () => {
  const parsed = JSON.parse(serializeBackup([], now.getTime()));
  assert.deepEqual(parsed.entries, []);
  assert.equal(parsed.app, 'pocket-ledger');
  assert.equal(parsed.version, 1);
});

test('rejects non-array entries', () => {
  assert.throws(() => serializeBackup(null, now), TypeError);
});

test('backupFilename uses the zero-padded local date', () => {
  assert.equal(backupFilename(now), 'pocket-ledger-backup-2026-09-05.json');
  assert.equal(backupFilename(new Date(2026, 11, 31, 23, 59)), 'pocket-ledger-backup-2026-12-31.json');
  assert.equal(backupFilename(new Date(2026, 0, 1, 0, 0).getTime()), 'pocket-ledger-backup-2026-01-01.json');
});
