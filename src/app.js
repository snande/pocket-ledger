import { parseEntry, categorise } from './parse.js';

const amountFormat = new Intl.NumberFormat('en-IN');

export function formatEntry(entry) {
  return `₹${amountFormat.format(entry.amount)} ${entry.label} ${entry.category}`;
}

export async function submitQuickEntry(text, store, now) {
  let parsed;
  try {
    parsed = parseEntry(text, now);
  } catch {
    return null;
  }
  if (!parsed) return null;

  const { amount, label } = parsed;
  return store.addEntry({ amount, label, category: categorise(label) });
}
