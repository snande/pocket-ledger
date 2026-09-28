import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal DOM stand-in covering only what src/ui.js touches (no network, no deps).
class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.parent = null;
    this.children = [];
    this.attrs = new Map();
    this.listeners = new Map();
    this._text = '';
  }

  get textContent() {
    return this.tag === '#text'
      ? this._text
      : this._text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(value) {
    this.children.forEach((c) => { c.parent = null; });
    this.children = [];
    this._text = String(value);
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes) {
    this.children.forEach((c) => { c.parent = null; });
    this.children = [];
    this._text = '';
    nodes.forEach((n) => this.appendChild(n));
  }

  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  closest(selector) {
    assert.equal(selector, 'button[data-action="delete"]');
    for (let node = this; node; node = node.parent) {
      if (node.tag === 'button' && node.getAttribute('data-action') === 'delete') return node;
    }
    return null;
  }

  click() {
    const event = { target: this };
    for (let node = this; node; node = node.parent) {
      (node.listeners.get('click') ?? []).forEach((fn) => fn(event));
    }
  }

  deleteButtons() {
    const found = [];
    const walk = (node) => {
      if (node.tag === 'button' && node.getAttribute('data-action') === 'delete') found.push(node);
      node.children.forEach(walk);
    };
    walk(this);
    return found;
  }
}

// One stable node per id for the lifetime of a test, so the delegated click
// handler bound to #today-list keeps receiving clicks across renders.
function installDom() {
  const byId = {
    'total-today': new FakeNode('span'),
    'total-month': new FakeNode('span'),
    'today-list': new FakeNode('ul'),
    'entry-error': new FakeNode('p'),
  };
  byId['total-today'].textContent = '₹0.00';
  byId['total-month'].textContent = '₹0.00';
  globalThis.document = {
    getElementById: (id) => byId[id] ?? null,
    createElement: (tag) => new FakeNode(tag),
    createTextNode: (text) => {
      const node = new FakeNode('#text');
      node._text = String(text);
      return node;
    },
  };
  return byId;
}

let dom;
let ui;
let seq = 0;
let warn;
let error;

beforeEach(async () => {
  dom = installDom();
  warn = mock.method(console, 'warn', () => {});
  error = mock.method(console, 'error', () => {});
  // A fresh module instance per test so the entries array and list binding start clean.
  ui = await import(`../src/ui.js?case=${seq++}`);
});

afterEach(() => {
  mock.restoreAll();
});

const entry = (id, amount, createdAt = Date.now()) => ({
  id, amount, label: 'chai', category: 'Food', createdAt,
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('index.html has the total-today and total-month elements showing ₹0.00', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<[^>]*id="total-today"[^>]*>₹0\.00</);
  assert.match(html, /<[^>]*id="total-month"[^>]*>₹0\.00</);
});

test('render of an empty list shows ₹0.00 totals and no rows', () => {
  ui.render([]);
  assert.equal(dom['total-today'].textContent, '₹0.00');
  assert.equal(dom['total-month'].textContent, '₹0.00');
  assert.equal(dom['today-list'].children.length, 0);
});

test('addEntry then deleting via the delete button updates both totals', () => {
  ui.addEntry(entry('a', 120));
  assert.equal(dom['total-today'].textContent, '₹120.00');
  assert.equal(dom['total-month'].textContent, '₹120.00');

  ui.addEntry(entry('b', 30.5));
  assert.equal(dom['total-today'].textContent, '₹150.50');
  assert.equal(dom['total-month'].textContent, '₹150.50');

  const buttons = dom['today-list'].deleteButtons();
  assert.deepEqual(buttons.map((b) => b.getAttribute('data-id')).sort(), ['a', 'b']);

  buttons.find((b) => b.getAttribute('data-id') === 'a').click();
  assert.equal(dom['total-today'].textContent, '₹30.50');
  assert.equal(dom['total-month'].textContent, '₹30.50');
  assert.deepEqual(ui.getEntries().map((e) => e.id), ['b']);

  dom['today-list'].deleteButtons()[0].click();
  assert.equal(dom['total-today'].textContent, '₹0.00');
  assert.equal(dom['total-month'].textContent, '₹0.00');
  assert.equal(dom['today-list'].children.length, 0);
});

test('render accepts ISO-string createdAt as written by the store', () => {
  ui.render([{ ...entry('a', 40), createdAt: new Date().toISOString() }]);
  assert.equal(dom['total-today'].textContent, '₹40.00');
  assert.equal(dom['total-month'].textContent, '₹40.00');
});

test('an entry from earlier this month counts toward the month only but still gets a row', () => {
  const now = new Date();
  if (now.getDate() === 1) return; // no earlier day exists this month
  const earlier = new Date(now.getFullYear(), now.getMonth(), 1, 12).getTime();
  ui.render([entry('a', 75, earlier), entry('b', 5)]);
  assert.equal(dom['total-today'].textContent, '₹5.00');
  assert.equal(dom['total-month'].textContent, '₹80.00');
  assert.deepEqual(dom['today-list'].deleteButtons().map((b) => b.getAttribute('data-id')), ['b', 'a']);
});

test('entries from a previous month are listed but count toward neither total', () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12).getTime();
  ui.render([entry('a', 75, lastMonth), entry('b', 5)]);
  assert.equal(dom['total-today'].textContent, '₹5.00');
  assert.equal(dom['total-month'].textContent, '₹5.00');
  assert.deepEqual(dom['today-list'].deleteButtons().map((b) => b.getAttribute('data-id')), ['b', 'a']);
});

test('entries with an unparseable createdAt or invalid amount are skipped with a warning', () => {
  ui.render([
    entry('a', 10),
    { ...entry('b', 20), createdAt: 'not a date' },
    { ...entry('c', 30), createdAt: undefined },
    { ...entry('d', Number.NaN) },
  ]);
  assert.equal(dom['total-today'].textContent, '₹10.00');
  assert.equal(dom['total-month'].textContent, '₹10.00');
  assert.equal(warn.mock.callCount(), 3);
});

test('addEntry assigns unique ids to entries that lack one so deletes hit the right row', () => {
  const first = ui.addEntry({ amount: 1, label: 'a', category: 'Other' });
  const second = ui.addEntry({ amount: 2, label: 'b', category: 'Other' });
  assert.ok(first.id && second.id);
  assert.notEqual(first.id, second.id);
  assert.equal(dom['total-today'].textContent, '₹3.00');

  dom['today-list'].deleteButtons()
    .find((b) => b.getAttribute('data-id') === second.id)
    .click();
  assert.deepEqual(ui.getEntries().map((e) => e.id), [first.id]);
  assert.equal(dom['total-today'].textContent, '₹1.00');
});

test('addEntry rejects a duplicate id', () => {
  ui.addEntry(entry('a', 1));
  assert.throws(() => ui.addEntry(entry('a', 2)), /duplicate entry id/);
  assert.equal(ui.getEntries().length, 1);
});

test('setEntries replaces the list and renders', () => {
  ui.addEntry(entry('a', 1));
  ui.setEntries([entry('b', 7), entry('c', 3)]);
  assert.deepEqual(ui.getEntries().map((e) => e.id), ['b', 'c']);
  assert.equal(dom['total-today'].textContent, '₹10.00');
});

test('deleting notifies the delete listener with the id', async () => {
  const seen = [];
  ui.setDeleteListener(async (id) => { seen.push(id); return true; });
  ui.addEntry(entry('a', 10));
  dom['today-list'].deleteButtons()[0].click();
  await flush();
  assert.deepEqual(seen, ['a']);
  assert.equal(dom['total-today'].textContent, '₹0.00');
  assert.equal(dom['entry-error'].textContent, '');
});

test('a rejected persistent delete rolls the entry back and reports an error', async () => {
  ui.setDeleteListener(async () => { throw new Error('disk full'); });
  ui.addEntry(entry('a', 10));
  ui.addEntry(entry('b', 5));
  dom['today-list'].deleteButtons().find((b) => b.getAttribute('data-id') === 'a').click();
  assert.equal(dom['total-today'].textContent, '₹5.00'); // optimistic, synchronous
  await flush();
  assert.deepEqual(ui.getEntries().map((e) => e.id), ['a', 'b']);
  assert.equal(dom['total-today'].textContent, '₹15.00');
  assert.equal(dom['entry-error'].textContent, ui.DELETE_ERROR_MESSAGE);
  assert.equal(error.mock.callCount(), 1);
});

test('a delete the store reports as not done (false) is rolled back', async () => {
  ui.setDeleteListener(async () => false);
  ui.addEntry(entry('a', 10));
  ui.deleteEntry('a');
  await flush();
  assert.deepEqual(ui.getEntries().map((e) => e.id), ['a']);
  assert.equal(dom['entry-error'].textContent, ui.DELETE_ERROR_MESSAGE);
});

test('a synchronously throwing delete listener is rolled back too', () => {
  ui.setDeleteListener(() => { throw new Error('boom'); });
  ui.addEntry(entry('a', 10));
  ui.deleteEntry('a');
  assert.deepEqual(ui.getEntries().map((e) => e.id), ['a']);
  assert.equal(dom['total-today'].textContent, '₹10.00');
});

test('deleting an unknown id changes nothing', () => {
  ui.addEntry(entry('a', 10));
  assert.equal(ui.deleteEntry('missing'), false);
  assert.equal(dom['total-today'].textContent, '₹10.00');
});
