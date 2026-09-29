import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initApp, BACKUP_ERROR_MESSAGE } from '../src/app.js';
import { backupFilename, parseBackup } from '../src/backup.js';

class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = new Map();
    this.listeners = new Map();
    this.value = '';
    this._text = '';
  }

  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }

  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = []; this._text = ''; nodes.forEach((n) => this.appendChild(n)); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  querySelector() { return this.input; }
  focus() {}
  remove() { this.removed = true; }
  click() { this.clicked = true; this.events.push(`click:${this.download}`); }
  async fire(type) {
    for (const fn of this.listeners.get(type) ?? []) await fn({ preventDefault() {} });
  }
}

let dom;
let events;
let anchors;
let blobs;
let originalCreate;
let originalRevoke;

beforeEach(() => {
  events = [];
  anchors = [];
  blobs = [];
  dom = {
    'quick-entry': new Node('form'),
    'entry-error': new Node('p'),
    'total-today': new Node('span'),
    'total-month': new Node('span'),
    'today-list': new Node('ul'),
    'backup-button': new Node('button'),
  };
  dom['quick-entry'].input = new Node('input');
  globalThis.document = {
    getElementById: (id) => dom[id] ?? null,
    createElement: (tag) => {
      const node = new Node(tag);
      node.events = events;
      if (tag === 'a') anchors.push(node);
      return node;
    },
    createTextNode: (text) => {
      const node = new Node('#text');
      node._text = String(text);
      return node;
    },
    body: new Node('body'),
  };
  originalCreate = URL.createObjectURL;
  originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return 'blob:fake';
  };
  URL.revokeObjectURL = (url) => { events.push(`revoke:${url}`); };
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  mock.restoreAll();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  delete globalThis.document;
});

const stubStorage = (rows) => ({
  openStore: async () => {},
  listEntries: async () => rows.slice(),
  addEntry: async () => {},
  deleteEntry: async () => {},
});

test('index.html shows a Backup button', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.match(html, /<button[^>]*id="backup-button"[^>]*>Backup<\/button>/);
});

test('clicking Backup downloads every stored entry and revokes the URL', async () => {
  const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15, 12).getTime();
  const rows = [
    { id: '1', amount: 75, note: 'rent', category: 'Other', createdAt: lastMonth },
    { id: '2', amount: 120, note: 'chai', category: 'Food', createdAt: Date.now() },
  ];
  await initApp(stubStorage(rows));
  await dom['backup-button'].fire('click');

  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].type, 'application/json');
  const parsed = parseBackup(await blobs[0].text());
  assert.deepEqual(parsed.entries, rows);

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].download, backupFilename(Date.now()));
  assert.equal(anchors[0].href, 'blob:fake');
  assert.equal(anchors[0].clicked, true);
  assert.equal(anchors[0].removed, true);
  assert.deepEqual(events, [`click:${anchors[0].download}`, 'revoke:blob:fake']);
  assert.equal(dom['entry-error'].textContent, '');
});

test('a storage failure shows the backup error and downloads nothing', async () => {
  const storage = stubStorage([]);
  await initApp(storage);
  storage.listEntries = async () => { throw new Error('boom'); };
  await dom['backup-button'].fire('click');
  assert.equal(dom['entry-error'].textContent, BACKUP_ERROR_MESSAGE);
  assert.equal(anchors.length, 0);
});
