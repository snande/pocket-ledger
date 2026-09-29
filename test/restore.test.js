import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initApp, RESTORE_ERROR_MESSAGE } from '../src/app.js';
import { serializeBackup } from '../src/backup.js';
import { computeTotals } from '../src/totals.js';

class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = new Map();
    this.listeners = new Map();
    this.value = '';
    this._text = '';
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(value) { this.children = []; this._text = String(value); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = []; this._text = ''; nodes.forEach((n) => this.appendChild(n)); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  querySelector() { return this.input; }
  focus() {}
  remove() {}
  async fire(type) {
    for (const fn of this.listeners.get(type) ?? []) await fn({ preventDefault() {} });
  }
}

// In-memory stand-in for storage.js; `rows` plays the role of the persisted database.
const stubStorage = (rows) => ({
  rows,
  openStore: async () => {},
  listEntries: async () => rows.map((r) => ({ ...r })).sort((a, b) => a.createdAt - b.createdAt),
  addEntry: async () => {},
  deleteEntry: async () => {},
  putEntries: async (entries) => {
    for (const e of entries) {
      const i = rows.findIndex((r) => r.id === e.id);
      if (i === -1) rows.push({ ...e });
      else rows[i] = { ...e };
    }
  },
});

const fileOf = (text) => ({ text: async () => text });
const now = Date.now();
const backupRows = [
  { id: 'a', amount: 75, note: 'rent', category: 'Other', createdAt: now - 1000 },
  { id: 'b', amount: 120, note: 'chai', category: 'Food', createdAt: now },
];

let dom;

beforeEach(() => {
  dom = {
    'quick-entry': new Node('form'),
    'entry-error': new Node('p'),
    'restore-status': new Node('p'),
    'total-today': new Node('span'),
    'total-month': new Node('span'),
    'today-list': new Node('ul'),
    'restore-input': new Node('input'),
  };
  dom['quick-entry'].input = new Node('input');
  globalThis.document = {
    getElementById: (id) => dom[id] ?? null,
    createElement: (tag) => new Node(tag),
    createTextNode: (text) => {
      const node = new Node('#text');
      node._text = String(text);
      return node;
    },
    body: new Node('body'),
  };
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  mock.restoreAll();
  delete globalThis.document;
});

const choose = async (text) => {
  dom['restore-input'].files = [fileOf(text)];
  await dom['restore-input'].fire('change');
};

test('index.html has a labelled .json file input and a status line for restoring', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.match(html, /<input[^>]*type="file"[^>]*id="restore-input"[^>]*accept="[^"]*\.json[^"]*"/);
  assert.match(html, /<label[^>]*for="restore-input"[^>]*>Restore backup<\/label>/);
  assert.match(html, /<p id="restore-status" role="status"><\/p>/);
});

test('restoring into an empty ledger persists the entries and renders matching totals', async () => {
  const storage = stubStorage([]);
  await initApp(storage);
  await choose(serializeBackup(backupRows, now));

  assert.deepEqual(await storage.listEntries(), backupRows);
  assert.equal(dom['restore-status'].textContent, 'Restored 2 entries');
  assert.equal(dom['entry-error'].textContent, '');
  const totals = computeTotals(backupRows, new Date());
  assert.ok(dom['total-today'].textContent.includes(String(totals.today)));
  assert.ok(dom['total-month'].textContent.includes(String(totals.month)));
  assert.equal(dom['today-list'].children.length, 2);
});

test('an overlapping backup adds only unknown ids and existing entries win', async () => {
  const stored = { ...backupRows[0], amount: 999 };
  const storage = stubStorage([stored]);
  await initApp(storage);
  await choose(serializeBackup(backupRows, now));
  assert.equal(dom['restore-status'].textContent, 'Restored 1 entry');
  assert.deepEqual(await storage.listEntries(), [stored, backupRows[1]]);
});

test('an invalid file shows the parse error and leaves storage unchanged', async () => {
  const storage = stubStorage([backupRows[0]]);
  await initApp(storage);
  await choose('not json');
  assert.equal(dom['entry-error'].textContent, 'Backup is not valid JSON');
  assert.equal(dom['restore-status'].textContent, '');
  assert.deepEqual(await storage.listEntries(), [backupRows[0]]);
});

test('a storage failure shows the generic restore error, not the raw message', async () => {
  const storage = stubStorage([]);
  await initApp(storage);
  storage.putEntries = async () => { throw new Error('IDB internal boom'); };
  await choose(serializeBackup(backupRows, now));
  assert.equal(dom['entry-error'].textContent, RESTORE_ERROR_MESSAGE);
  assert.deepEqual(await storage.listEntries(), []);
});
