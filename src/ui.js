import { computeTotals, categoryBreakdown, formatRupees } from './totals.js';
import { formatEntry, formatAmount } from './format.js';

export const DELETE_ERROR_MESSAGE = 'Could not delete that entry';
export const EMPTY_BREAKDOWN_MESSAGE = 'No entries this month';

export const entries = [];

let deleteListener = null;
const boundLists = new WeakSet();

// fn(id) may return a Promise; a rejection or a resolved `false` rolls the delete back.
export function setDeleteListener(fn) {
  deleteListener = fn;
}

function toEpochMs(createdAt) {
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt;
  return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

function isRenderable(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.amount === 'number' &&
    Number.isFinite(entry.amount) &&
    toEpochMs(entry.createdAt) !== null
  );
}

function reportDeleteFailure(err) {
  console.error('delete failed', err);
  const errorEl = document.getElementById('entry-error');
  if (errorEl) errorEl.textContent = DELETE_ERROR_MESSAGE;
}

function bindDelete(listEl) {
  if (boundLists.has(listEl)) return;
  boundLists.add(listEl);
  listEl.addEventListener('click', (event) => {
    const target = event.target;
    const button =
      target && typeof target.closest === 'function'
        ? target.closest('button[data-action="delete"]')
        : null;
    if (!button) return;
    deleteEntry(button.getAttribute('data-id'));
  });
}

// rows are categoryBreakdown results. textContent (never innerHTML) keeps
// note-derived names from being interpreted as markup.
export function renderCategoryBreakdown(container, rows) {
  if (!container) return;
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.setAttribute('data-empty', 'true');
    li.textContent = EMPTY_BREAKDOWN_MESSAGE;
    container.replaceChildren(li);
    return;
  }
  container.replaceChildren(
    ...rows.map(({ category, total }) => {
      const li = document.createElement('li');
      li.textContent = `${category} ${formatAmount(total)}`;
      return li;
    }),
  );
}

// Rows (the #today-list) list every valid entry, newest first. The totals come from
// computeTotals, which counts only entries in the device's local day and month.
// Entries with a non-numeric amount or unparseable createdAt are skipped, with a warning.
export function render(list) {
  const now = new Date();
  const valid = [];
  for (const entry of list) {
    if (isRenderable(entry)) {
      valid.push({ entry, t: toEpochMs(entry.createdAt) });
    } else {
      console.warn('render: skipping entry with invalid amount or createdAt', entry);
    }
  }

  const totals = computeTotals(
    valid.map(({ entry, t }) => ({ amount: entry.amount, createdAt: t })),
    now,
  );
  document.getElementById('total-today').textContent = formatRupees(totals.today);
  document.getElementById('total-month').textContent = formatRupees(totals.month);

  // categoryBreakdown reads the note from `note`; UI entries carry it as `label`.
  renderCategoryBreakdown(
    document.getElementById('category-breakdown'),
    categoryBreakdown(
      valid.map(({ entry, t }) => ({ amount: entry.amount, createdAt: t, note: entry.label })),
      now,
    ),
  );

  const listEl = document.getElementById('today-list');
  if (!listEl) return;
  bindDelete(listEl);
  // Newest first; reverse before the stable sort so ties list latest-added first.
  const rows = valid.slice().reverse().sort((a, b) => b.t - a.t);
  // Full rebuild on every call is a deliberate simplicity tradeoff for a small daily list.
  listEl.replaceChildren(
    ...rows.map(({ entry }) => {
      const li = document.createElement('li');
      li.appendChild(document.createTextNode(formatEntry(entry) + ' '));
      const button = document.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('data-action', 'delete');
      button.setAttribute('data-id', String(entry.id));
      button.setAttribute('aria-label', `Delete ${entry.label}`);
      button.textContent = 'Delete';
      li.appendChild(button);
      return li;
    }),
  );
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Guarantees the invariant delete relies on: every entry has a unique string id.
function prepare(entry, taken) {
  const id = entry.id === undefined || entry.id === null ? newId() : String(entry.id);
  if (taken.has(id)) throw new Error(`duplicate entry id: ${id}`);
  return { ...entry, id, createdAt: entry.createdAt === undefined ? Date.now() : entry.createdAt };
}

export function addEntry(entry) {
  const prepared = prepare(entry, new Set(entries.map((e) => e.id)));
  entries.push(prepared);
  render(entries);
  return prepared;
}

export function setEntries(list) {
  const taken = new Set();
  const prepared = list.map((entry) => {
    const p = prepare(entry, taken);
    taken.add(p.id);
    return p;
  });
  entries.splice(0, entries.length, ...prepared);
  render(entries);
}

function restore(removed, index) {
  entries.splice(Math.min(index, entries.length), 0, removed);
  render(entries);
}

// Updates the in-memory list and the DOM synchronously, then asks the delete listener
// (persistence) to follow; if it fails or reports nothing was deleted, the entry is put back.
export function deleteEntry(id) {
  const index = entries.findIndex((entry) => entry.id === String(id));
  if (index === -1) return false;
  const [removed] = entries.splice(index, 1);
  render(entries);
  if (deleteListener) {
    const fail = (err) => {
      restore(removed, index);
      reportDeleteFailure(err);
    };
    try {
      Promise.resolve(deleteListener(removed.id)).then(
        (ok) => { if (ok === false) fail(new Error('store did not delete entry')); },
        fail,
      );
    } catch (err) {
      fail(err);
    }
  }
  return true;
}

export function getEntries() {
  return entries.slice();
}
