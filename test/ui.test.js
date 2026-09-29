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
    'category-breakdown': new FakeNode('ul'),
    'month-chart': new FakeNode('div'),
    'search-input': new FakeNode('input'),
    'search-results': new FakeNode('ul'),
  };
  byId['search-input'].value = '';
  byId['total-today'].textContent = '₹0.00';
  byId['total-month'].textContent = '₹0.00';
  globalThis.document = {
    getElementById: (id) => byId[id] ?? null,
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (_ns, tag) => new FakeNode(tag),
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
  assert.deepEqual(
    dom['today-list'].children.map((li) => li.textContent),
    ['₹5 chai Food Delete', '₹75 chai Food Delete'],
  );
});

test('entries from a previous month are listed but count toward neither total', () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12).getTime();
  ui.render([entry('a', 75, lastMonth), entry('b', 5)]);
  assert.equal(dom['total-today'].textContent, '₹5.00');
  assert.equal(dom['total-month'].textContent, '₹5.00');
  assert.deepEqual(dom['today-list'].deleteButtons().map((b) => b.getAttribute('data-id')), ['b', 'a']);
  assert.deepEqual(
    dom['today-list'].children.map((li) => li.textContent),
    ['₹5 chai Food Delete', '₹75 chai Food Delete'],
  );
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

test('index.html has the category-breakdown container and sw.js precaches its modules', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<ul[^>]*id="category-breakdown"/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const file of ['./src/ui.js', './src/totals.js', './src/format.js']) {
    assert.ok(sw.includes(`'${file}'`), `${file} missing from PRECACHE_URLS`);
  }
});

test('the breakdown shows an empty-state message when there are no current-month entries', () => {
  ui.render([]);
  assert.deepEqual(dom['category-breakdown'].children.map((li) => li.textContent), [ui.EMPTY_BREAKDOWN_MESSAGE]);

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12).getTime();
  ui.render([entry('a', 75, lastMonth)]);
  assert.deepEqual(dom['category-breakdown'].children.map((li) => li.textContent), [ui.EMPTY_BREAKDOWN_MESSAGE]);
});

test('addEntry refreshes the breakdown rows in the same update as the totals', () => {
  ui.addEntry({ id: 'a', amount: 120, label: 'chai', category: 'Food' });
  assert.equal(dom['total-month'].textContent, '₹120.00');
  assert.deepEqual(dom['category-breakdown'].children.map((li) => li.textContent), ['Food ₹120']);

  ui.addEntry({ id: 'b', amount: 30.5, label: 'chai', category: 'Food' });
  assert.equal(dom['total-month'].textContent, '₹150.50');
  assert.deepEqual(dom['category-breakdown'].children.map((li) => li.textContent), ['Food ₹150.5']);
});

test('the breakdown groups by category, not label, and lists totals largest first', () => {
  ui.setEntries([
    { id: '1', amount: 100, label: 'chai', category: 'Food', createdAt: Date.now() },
    { id: '2', amount: 50, label: 'lunch', category: 'Food', createdAt: Date.now() },
    { id: '3', amount: 200, label: 'uber', category: 'Transport', createdAt: Date.now() },
    { id: '4', amount: 20, label: 'gift', category: 'Other', createdAt: Date.now() },
  ]);
  assert.deepEqual(
    dom['category-breakdown'].children.map((li) => li.textContent),
    ['Transport ₹200', 'Food ₹150', 'Other ₹20'],
  );
  assert.equal(dom['total-month'].textContent, '₹370.00');

  ui.deleteEntry('3');
  assert.deepEqual(
    dom['category-breakdown'].children.map((li) => li.textContent),
    ['Food ₹150', 'Other ₹20'],
  );
});

test('breakdown rows use textContent so markup in a label stays literal', () => {
  ui.addEntry({ id: 'a', amount: 10, label: '<img src=x onerror=alert(1)>', category: 'Other' });
  const rows = dom['category-breakdown'].children;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].children.length, 0);
  assert.equal(rows[0].textContent, 'Other ₹10');
});

const cmp = (...rows) => ({
  year: 2026,
  month: 8,
  categories: rows.map(([category, total, previousTotal]) => ({
    category, total, previousTotal, change: total - previousTotal, changePercent: null,
  })),
});
const pieNodes = (el) => el.children[0].children;

test('index.html has the month-chart container and sw.js precaches src/monthly.js', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<[^>]*id="month-chart"/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./src/monthly.js'"));
});

test('renderMonthChart shows the empty message when nothing was spent this month', () => {
  const el = new FakeNode('div');
  ui.renderMonthChart(el, cmp());
  assert.equal(el.textContent, 'No entries this month');
  assert.equal(el.children.length, 0);
  ui.renderMonthChart(el, cmp(['Food', 0, 40]));
  assert.equal(el.textContent, 'No entries this month');
});

test('renderMonthChart draws proportional path slices and a legend row per category', () => {
  const el = new FakeNode('div');
  ui.renderMonthChart(el, cmp(['Food', 75, 50], ['Transport', 25, 0], ['Other', 0, 10]));
  const [svg, legend] = el.children;
  assert.equal(svg.tag, 'svg');
  const slices = svg.children;
  assert.equal(slices.length, 2);
  assert.ok(slices.every((s) => s.tag === 'path'));
  // Food is 75% (270deg): large-arc flag 1; Transport is 25%: flag 0.
  assert.match(slices[0].getAttribute('d'), /A 50 50 0 1 1 /);
  assert.match(slices[1].getAttribute('d'), /A 50 50 0 0 1 /);
  assert.notEqual(slices[0].getAttribute('fill'), slices[1].getAttribute('fill'));
  assert.deepEqual(legend.children.map((li) => li.textContent), [
    'Food ₹75 +₹25',
    'Transport ₹25 new',
    'Other ₹0 −₹10',
  ]);
});

test('renderMonthChart draws a full circle for a single category', () => {
  const el = new FakeNode('div');
  ui.renderMonthChart(el, cmp(['Food', 120, 0]));
  assert.equal(pieNodes(el).length, 1);
  assert.equal(pieNodes(el)[0].tag, 'circle');
});

test('a single positive category that is not first still gets one circle, in its own colour', () => {
  const el = new FakeNode('div');
  ui.renderMonthChart(el, cmp(['Food', 0, 5], ['Transport', 80, 20]));
  assert.equal(pieNodes(el).length, 1);
  assert.equal(pieNodes(el)[0].tag, 'circle');
  assert.equal(pieNodes(el)[0].getAttribute('data-category'), 'Transport');
  assert.equal(el.children[1].children[1].children[0].getAttribute('style'), `background:${pieNodes(el)[0].getAttribute('fill')}`);
});

test('an unchanged category reads ±₹0, not a signed +', () => {
  const el = new FakeNode('div');
  ui.renderMonthChart(el, cmp(['Food', 50, 50]));
  assert.equal(el.children[1].children[0].textContent, 'Food ₹50 ±₹0');
});

test('a negative total (refund) gets no slice, is excluded from the pie share, and keeps its true legend amount', () => {
  const el = new FakeNode('div');
  ui.renderMonthChart(el, cmp(['Food', 60, 0], ['Transport', 40, 0], ['Bills', -20, 0]));
  const slices = pieNodes(el);
  assert.equal(slices.length, 2);
  // 60 / (60 + 40) = 60% => 216deg, a large arc; 40% => small arc.
  assert.match(slices[0].getAttribute('d'), /A 50 50 0 1 1 /);
  assert.match(slices[1].getAttribute('d'), /A 50 50 0 0 1 /);
  assert.equal(el.children[1].children[2].textContent, 'Bills ₹-20 new');
  ui.renderMonthChart(el, cmp(['Bills', -20, 0]));
  assert.equal(el.textContent, 'No entries this month');
});

test('slice colours follow the category, not its position in the ordering', () => {
  const a = new FakeNode('div');
  const b = new FakeNode('div');
  ui.renderMonthChart(a, cmp(['Food', 70, 0], ['Transport', 30, 0]));
  ui.renderMonthChart(b, cmp(['Transport', 70, 0], ['Food', 30, 0]));
  const fill = (el, cat) => pieNodes(el).find((n) => n.getAttribute('data-category') === cat).getAttribute('fill');
  assert.equal(fill(a, 'Food'), fill(b, 'Food'));
  assert.equal(fill(a, 'Transport'), fill(b, 'Transport'));
});

test('addEntry re-renders #month-chart without a reload', () => {
  ui.render([]);
  assert.equal(dom['month-chart'].textContent, 'No entries this month');
  ui.addEntry({ id: 'a', amount: 120, label: 'chai', category: 'Food' });
  assert.equal(pieNodes(dom['month-chart']).length, 1);
  assert.match(dom['month-chart'].children[1].textContent, /₹120 new/);
});

test('entries in two categories go through addEntry into two slices and two legend rows', () => {
  ui.addEntry({ id: 'a', amount: 300, label: 'chai', category: 'Food' });
  ui.addEntry({ id: 'b', amount: 100, label: 'uber', category: 'Transport' });
  const chart = dom['month-chart'];
  const slices = pieNodes(chart);
  assert.equal(slices.length, 2);
  assert.deepEqual(slices.map((s) => s.getAttribute('data-category')), ['Food', 'Transport']);
  assert.match(slices[0].getAttribute('d'), /A 50 50 0 1 1 /);
  assert.deepEqual(chart.children[1].children.map((li) => li.textContent), ['Food ₹300 new', 'Transport ₹100 new']);
});

test('index.html has the search input and results container', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<input[^>]*id="search-input"/);
  assert.match(html, /<ul[^>]*id="search-results"/);
});

const searchRows = () => dom['search-results'].children.map((li) => li.textContent);
const search = (query) => {
  dom['search-input'].value = query;
  ui.refreshSearch();
};

test('search lists every match (not the non-matching entry between them) newest first with exact date and amount', () => {
  const noon = (d) => new Date(2026, 2, d, 12).getTime();
  ui.addEntry({ id: 'a', amount: 20, label: 'masala chai', category: 'Food', createdAt: noon(12) });
  ui.addEntry({ id: 'b', amount: 500, label: 'petrol', category: 'Transport', createdAt: noon(13) });
  ui.addEntry({ id: 'c', amount: 1500, label: 'Chai', category: 'Food', createdAt: new Date(2026, 2, 14, 12).toISOString() });
  search('CHAI');
  assert.deepEqual(searchRows(), ['Chai 14 Mar 2026 ₹1,500', 'masala chai 12 Mar 2026 ₹20']);
});

test('search shows the no-matches message when nothing matches', () => {
  ui.addEntry(entry('a', 30));
  search('petrol');
  assert.deepEqual(searchRows(), [ui.NO_MATCHES_MESSAGE]);
});

test('search results refresh when an entry is added after the query was typed', () => {
  search('chai');
  assert.deepEqual(searchRows(), [ui.NO_MATCHES_MESSAGE]);
  ui.addEntry(entry('a', 30, new Date(2026, 0, 5, 12).getTime()));
  assert.deepEqual(searchRows(), ['chai 5 Jan 2026 ₹30']);
});

test('search results follow setEntries and deleteEntry', () => {
  search('chai');
  ui.setEntries([entry('a', 30, new Date(2026, 0, 5, 12).getTime())]);
  assert.equal(searchRows().length, 1);
  ui.deleteEntry('a');
  assert.deepEqual(searchRows(), [ui.NO_MATCHES_MESSAGE]);
});

test('clearing the query empties results that were showing', () => {
  ui.addEntry(entry('a', 30));
  search('chai');
  assert.equal(searchRows().length, 1);
  search('');
  assert.equal(dom['search-results'].children.length, 0);
  search('  ');
  assert.equal(dom['search-results'].children.length, 0);
});

test('an entry with an unparseable createdAt is skipped by search, not listed', () => {
  ui.addEntry(entry('a', 30));
  ui.entries.push({ id: 'z', amount: 5, label: 'chai', category: 'Food', createdAt: 'nope' });
  search('chai');
  assert.equal(searchRows().length, 1);
});

test('renderSearchResults omits an empty date instead of leaving a double space', () => {
  ui.renderSearchResults(dom['search-results'], [{ note: 'chai', createdAt: 'bad', amount: 20 }]);
  assert.deepEqual(searchRows(), ['chai ₹20']);
});
