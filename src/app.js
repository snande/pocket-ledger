import { parseEntry } from './parse.js';
import { categorise } from './categorise.js';

export const ERROR_MESSAGE = 'Use a format like 120 chai';

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
