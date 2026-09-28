import { test, beforeEach } from 'node:test';
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

function installDom() {
  const byId = {
    'total-today': new FakeNode('span'),
    'total-month': new FakeNode('span'),
    'today-list': new FakeNode('ul'),
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

beforeEach(async () => {
  dom = installDom();
  // A fresh module instance per test so the entries array and list binding start clean.
  ui = await import(`../src/ui.js?case=${seq++}`);
});

const entry = (id, amount, createdAt = Date.now()) => ({
  id, amount, label: 'chai', category: 'Food', createdAt,
});

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

test('an entry from earlier this month counts toward the month only', () => {
  const now = new Date();
  if (now.getDate() === 1) return; // no earlier day exists this month
  const earlier = new Date(now.getFullYear(), now.getMonth(), 1, 12).getTime();
  ui.render([entry('a', 75, earlier)]);
  assert.equal(dom['total-today'].textContent, '₹0.00');
  assert.equal(dom['total-month'].textContent, '₹75.00');
});

test('deleting notifies the registered delete listener with the id', () => {
  const seen = [];
  ui.setDeleteListener((id) => seen.push(id));
  ui.addEntry(entry('a', 10));
  dom['today-list'].deleteButtons()[0].click();
  assert.deepEqual(seen, ['a']);
});

test('deleting an unknown id changes nothing', () => {
  ui.addEntry(entry('a', 10));
  assert.equal(ui.deleteEntry('missing'), false);
  assert.equal(dom['total-today'].textContent, '₹10.00');
});
