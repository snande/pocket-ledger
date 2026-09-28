import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  initApp,
  SAVE_ERROR_MESSAGE,
  OPEN_ERROR_MESSAGE,
  LOAD_ERROR_MESSAGE,
} from '../src/app.js';

// Minimal DOM stand-in for what initApp and src/ui.js touch.
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
  async fire(type) {
    for (const fn of this.listeners.get(type) ?? []) await fn({ preventDefault() {} });
  }
}

let dom;

beforeEach(() => {
  dom = {
    'quick-entry': new Node('form'),
    'entry-error': new Node('p'),
    'total-today': new Node('span'),
    'total-month': new Node('span'),
    'today-list': new Node('ul'),
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
  };
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  mock.restoreAll();
  delete globalThis.document;
});

const stubStorage = (rows = [], overrides = {}) => ({
  openStore: async () => {},
  listEntries: async () => rows.slice(),
  addEntry: async (entry) => {
    const saved = { id: String(rows.length + 1), ...entry };
    rows.push(saved);
    return saved;
  },
  deleteEntry: async () => {},
  ...overrides,
});

const rowTexts = () => dom['today-list'].children.map((li) => li.textContent);

test('startup renders every stored entry and totals computed from them', async () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12).getTime();
  const rows = [
    { id: '1', amount: 75, note: 'rent', category: 'Other', createdAt: lastMonth },
    { id: '2', amount: 120, note: 'chai', category: 'Food', createdAt: now.getTime() },
  ];
  await initApp(stubStorage(rows));
  assert.deepEqual(rowTexts(), ['₹120 chai Food Delete', '₹75 rent Other Delete']);
  assert.equal(dom['total-today'].textContent, '₹120.00');
  assert.equal(dom['total-month'].textContent, '₹120.00');
  assert.equal(dom['entry-error'].textContent, '');
});

test('a successful add is written through addEntry and then shown', async () => {
  const rows = [];
  await initApp(stubStorage(rows));
  dom['quick-entry'].input.value = '120 chai';
  await dom['quick-entry'].fire('submit');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, 'chai');
  assert.equal(typeof rows[0].createdAt, 'number');
  assert.deepEqual(rowTexts(), ['₹120 chai Food Delete']);
  assert.equal(dom['total-today'].textContent, '₹120.00');
  assert.equal(dom['quick-entry'].input.value, '');
});

test('a failed write shows an error and does not display the entry', async () => {
  const storage = stubStorage([], {
    addEntry: async () => {
      throw new Error('disk full');
    },
  });
  await initApp(storage);
  dom['quick-entry'].input.value = '120 chai';
  await dom['quick-entry'].fire('submit');
  assert.equal(dom['entry-error'].textContent, SAVE_ERROR_MESSAGE);
  assert.deepEqual(rowTexts(), []);
  assert.equal(dom['total-today'].textContent, '₹0.00');
  assert.equal(dom['quick-entry'].input.value, '120 chai');
});

test('an invalid timestamp is reported as a save error and nothing is written', async () => {
  const rows = [];
  await initApp(stubStorage(rows), () => new Date(Number.NaN));
  dom['quick-entry'].input.value = '120 chai';
  await dom['quick-entry'].fire('submit');
  assert.equal(dom['entry-error'].textContent, SAVE_ERROR_MESSAGE);
  assert.equal(rows.length, 0);
  assert.deepEqual(rowTexts(), []);
});

test('startup failures show distinct open and load errors', async () => {
  await initApp(stubStorage([], { openStore: async () => { throw new Error('blocked'); } }));
  assert.equal(dom['entry-error'].textContent, OPEN_ERROR_MESSAGE);

  dom['entry-error'].textContent = '';
  await initApp(stubStorage([], { listEntries: async () => { throw new Error('boom'); } }));
  assert.equal(dom['entry-error'].textContent, LOAD_ERROR_MESSAGE);
});
