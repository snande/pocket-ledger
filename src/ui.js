import { computeTotals, formatRupees } from './totals.js';
import { formatEntry } from './app.js';

export const entries = [];

let deleteListener = null;
const boundLists = new WeakSet();

export function setDeleteListener(fn) {
  deleteListener = fn;
}

function toEpochMs(createdAt) {
  return typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt;
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

export function render(list) {
  const totals = computeTotals(
    list.map((entry) => ({ ...entry, createdAt: toEpochMs(entry.createdAt) })),
    new Date(),
  );
  document.getElementById('total-today').textContent = formatRupees(totals.today);
  document.getElementById('total-month').textContent = formatRupees(totals.month);

  const listEl = document.getElementById('today-list');
  if (!listEl) return;
  bindDelete(listEl);
  const sorted = list
    .slice()
    .reverse()
    .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
  listEl.replaceChildren(
    ...sorted.map((entry) => {
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

export function addEntry(entry) {
  entries.push(entry);
  render(entries);
  return entry;
}

export function deleteEntry(id) {
  const index = entries.findIndex((entry) => String(entry.id) === String(id));
  if (index === -1) return false;
  entries.splice(index, 1);
  render(entries);
  if (deleteListener) deleteListener(id);
  return true;
}

export function getEntries() {
  return entries.slice();
}
