import 'fake-indexeddb/auto';
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as storage from '../src/storage.js';
import { initApp, restoreBackup } from '../src/app.js';
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

const fileOf = (text) => ({ text: async () => text });
const now = Date.now();
const rows = [
  { id: 'a', amount: 75, note: 'rent', category: 'Other', createdAt: now - 1000 },
  { id: 'b', amount: 120, note: 'chai', category: 'Food', createdAt: now },
];

let dom;

beforeEach(async () => {
  await storage.openStore();
  await storage.clearAll();
  dom = {
    'quick-entry': new Node('form'),
    'entry-error': new Node('p'),
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

test('index.html has a labelled .json file input for restoring', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.match(html, /<input[^>]*type="file"[^>]*id="restore-input"[^>]*accept="[^"]*\.json[^"]*"/);
  assert.match(html, /<label[^>]*for="restore-input"[^>]*>Restore backup<\/label>/);
});

test('restoring into an empty ledger persists the entries and renders matching totals', async () => {
  await initApp(storage);
  await choose(serializeBackup(rows, now));

  assert.deepEqual(await storage.listEntries(), rows);
  assert.equal(dom['entry-error'].textContent, 'Restored 2 entries');
  const totals = computeTotals(rows, new Date());
  assert.ok(dom['total-today'].textContent.includes(String(totals.today)));
  assert.ok(dom['total-month'].textContent.includes(String(totals.month)));

  // survives a reload
  await storage.closeStore();
  assert.deepEqual(await storage.listEntries(), rows);
});

test('restoring an overlapping backup adds only new entries', async () => {
  await storage.putEntries([rows[0]]);
  await initApp(storage);
  await choose(serializeBackup(rows, now));
  assert.equal(dom['entry-error'].textContent, 'Restored 1 entry');
  assert.deepEqual(await storage.listEntries(), rows);
});

test('an invalid file shows the parse error and leaves storage unchanged', async () => {
  await storage.putEntries([rows[0]]);
  await initApp(storage);
  await choose('not json');
  assert.equal(dom['entry-error'].textContent, 'Backup is not valid JSON');
  assert.deepEqual(await storage.listEntries(), [rows[0]]);
  await assert.rejects(restoreBackup(fileOf('{}'), storage), /pocket-ledger/);
});
