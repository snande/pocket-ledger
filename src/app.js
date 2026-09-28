import { parseEntry } from './parse.js';
import { categorise } from './categorise.js';

export { computeTotals } from './totals.js';

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
export function createStorageStore(storage) {
  return {
    async addEntry({ amount, label, category, createdAt } = {}) {
      const saved = await storage.addEntry({
        amount,
        note: label,
        category,
        createdAt: createdAt === undefined ? undefined : toEpochMs(createdAt),
      });
      return fromStored(saved);
    },

    async listEntries() {
      const entries = await storage.listEntries();
      return entries.map(fromStored).sort((a, b) => b.createdAt - a.createdAt);
    },

    async deleteEntry(id) {
      await storage.deleteEntry(id);
      return true;
    },
  };
}

export async function hydrate(store, setEntries) {
  const entries = await store.listEntries();
  setEntries(entries);
  return entries;
}

const rupeeFormat = new Intl.NumberFormat('en-IN');

export function formatAmount(amount) {
  return '₹' + rupeeFormat.format(amount);
}

export function formatEntry(entry) {
  return `${formatAmount(entry.amount)} ${entry.label} ${entry.category}`;
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
