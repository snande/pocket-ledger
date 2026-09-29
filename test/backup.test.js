import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, backupFilename, parseBackup, mergeEntries } from '../src/backup.js';

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

test('parseBackup round-trips entries with extra fields', () => {
  const entries = [
    { id: 'a', amount: 120.5, note: 'chai', createdAt: 1000, category: 'food' },
    { id: 'b', amount: 0, note: '', createdAt: 2000 },
  ];
  const parsed = parseBackup(serializeBackup(entries, now));
  assert.deepEqual(parsed.entries, entries);
  assert.equal(parsed.exportedAt, now.getTime());
  assert.deepEqual(parseBackup(serializeBackup([], now)).entries, []);
});

test('parseBackup rejects bad input with an Error', () => {
  const good = { id: 'a', amount: 1, note: '', createdAt: 1 };
  const env = (o) =>
    JSON.stringify({ app: 'pocket-ledger', version: 1, exportedAt: 5, entries: [good], ...o });
  const bad = [
    'not json',
    'null',
    env({ app: 'other' }),
    env({ version: 2 }),
    env({ version: undefined }),
    env({ exportedAt: undefined }),
    env({ exportedAt: '5' }),
    env({ exportedAt: null }),
    env({ entries: {} }),
    env({ entries: [good, { ...good, id: 5 }] }),
    env({ entries: [{ amount: 1, createdAt: 1 }] }),
    env({ entries: [{ ...good, amount: '1' }] }),
    env({ entries: [{ ...good, amount: null }] }),
    env({ entries: [{ ...good, createdAt: undefined }] }),
    env({ entries: [{ ...good, createdAt: '5' }] }),
    env({ entries: [null] }),
  ];
  for (const text of bad) {
    assert.throws(() => parseBackup(text), (e) => e instanceof Error && e.message.length > 0, text);
  }
});

test('parseBackup rejects non-string input with a clear message', () => {
  for (const input of [undefined, null, 42, {}]) {
    assert.throws(() => parseBackup(input), /as text/);
  }
});

test('mergeEntries unions by id, existing wins, sorted, idempotent', () => {
  const existing = [
    { id: 'b', amount: 1, note: 'keep', createdAt: 200 },
    { id: 'a', amount: 2, note: '', createdAt: 100 },
  ];
  const incoming = [
    { id: 'b', amount: 9, note: 'replace?', createdAt: 200 },
    { id: 'c', amount: 3, note: '', createdAt: 50 },
  ];
  const once = mergeEntries(existing, incoming);
  assert.deepEqual(once.map((e) => e.id), ['c', 'a', 'b']);
  assert.equal(once.find((e) => e.id === 'b').note, 'keep');
  assert.deepEqual(mergeEntries(once, incoming), once);
  assert.equal(existing.length, 2);
});

test('mergeEntries collapses duplicate ids within one array, first wins', () => {
  const merged = mergeEntries(
    [{ id: 'a', amount: 1, note: 'first', createdAt: 1 }, { id: 'a', amount: 2, note: 'second', createdAt: 2 }],
    [],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].note, 'first');
});

test('mergeEntries rejects malformed entries and non-arrays with TypeError', () => {
  const ok = { id: 'a', amount: 1, note: '', createdAt: 1 };
  assert.throws(() => mergeEntries(null, []), TypeError);
  assert.throws(() => mergeEntries([], undefined), TypeError);
  assert.throws(() => mergeEntries([null], []), TypeError);
  assert.throws(() => mergeEntries([ok], [{ ...ok, id: 3 }]), TypeError);
  assert.throws(() => mergeEntries([ok], [{ ...ok, id: 'z', createdAt: NaN }]), TypeError);
});

test('importing under Node works without window or localStorage', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.localStorage, 'undefined');
});
