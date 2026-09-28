import { parseEntry } from './parse.js';
import { categorise } from './categorise.js';
import * as storage from './storage.js';
import { addEntry, setEntries, setDeleteListener } from './ui.js';

export { computeTotals } from './totals.js';
export { formatAmount, formatEntry } from './format.js';

export const ERROR_MESSAGE = 'Use a format like 120 chai';
export const SAVE_ERROR_MESSAGE = 'Could not save that entry';
export const OPEN_ERROR_MESSAGE = 'Could not open saved entries';
export const LOAD_ERROR_MESSAGE = 'Could not load saved entries';

function toEpochMs(createdAt) {
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt;
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    throw new TypeError('createdAt must be a valid timestamp');
  }
  return t;
}

function fromStored({ note, ...rest }) {
  return { ...rest, label: note };
}

// Adapts the storage.js module (note, epoch-ms createdAt, oldest first) to the
// store shape the app uses (label, newest first).
export function createStorageStore(storageApi) {
  return {
    async addEntry({ amount, label, category, createdAt } = {}) {
      const saved = await storageApi.addEntry({
        amount,
        note: label,
        category,
        createdAt: createdAt === undefined ? undefined : toEpochMs(createdAt),
      });
      return fromStored(saved);
    },

    async listEntries() {
      const entries = await storageApi.listEntries();
      return entries.map(fromStored).sort((a, b) => b.createdAt - a.createdAt);
    },

    async deleteEntry(id) {
      await storageApi.deleteEntry(id);
      return true;
    },
  };
}

export async function hydrate(store, render) {
  const entries = await store.listEntries();
  render(entries);
  return entries;
}

export async function submitQuickEntry(text, store, now) {
  const parsed = parseEntry(text);
  if (parsed === null) return null;
  const { amount, label } = parsed;
  return store.addEntry({
    amount,
    label,
    category: categorise(label),
    createdAt: now.toISOString(),
  });
}

// Entry point for index.html: loads stored entries (and the totals derived from
// them) into the page, then persists every add through the storage module.
// The returned promise settles once startup hydration has finished.
export function initApp(storageApi = storage, now = () => new Date()) {
  const store = createStorageStore(storageApi);
  const form = document.getElementById('quick-entry');
  const input = form.querySelector('input[type="text"]');
  const errorEl = document.getElementById('entry-error');

  setDeleteListener((id) => store.deleteEntry(id));

  const ready = (async () => {
    try {
      await storageApi.openStore();
    } catch (err) {
      console.error('open failed', err);
      errorEl.textContent = OPEN_ERROR_MESSAGE;
      return;
    }
    try {
      await hydrate(store, setEntries);
    } catch (err) {
      console.error('load failed', err);
      errorEl.textContent = LOAD_ERROR_MESSAGE;
    }
  })();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await ready;
    let entry;
    try {
      entry = await submitQuickEntry(input.value, store, now());
    } catch (err) {
      console.error('save failed', err);
      errorEl.textContent = SAVE_ERROR_MESSAGE;
      input.focus();
      return;
    }
    if (entry === null) {
      errorEl.textContent = ERROR_MESSAGE;
    } else {
      errorEl.textContent = '';
      input.value = '';
      addEntry(entry);
    }
    input.focus();
  });

  return ready;
}

if (typeof document !== 'undefined' && document.getElementById('quick-entry')) {
  initApp();
}
