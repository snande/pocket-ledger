import { categorise } from './categorise.js';

const rupeeFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toPaise(amount) {
  return Math.round(amount * 100);
}

function assertValidEntry(entry, index, fn) {
  if (entry === null || typeof entry !== 'object') {
    throw new TypeError(`${fn}: entries[${index}] must be an object`);
  }
  if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount)) {
    throw new TypeError(`${fn}: entries[${index}].amount must be a finite number`);
  }
  if (typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt)) {
    throw new TypeError(`${fn}: entries[${index}].createdAt must be a finite number (epoch ms)`);
  }
}

function assertValidInput(entries, now, fn) {
  if (!Array.isArray(entries)) {
    throw new TypeError(`${fn}: entries must be an array`);
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError(`${fn}: now must be a valid Date`);
  }
}

function monthRange(now) {
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    monthStart: new Date(y, m, 1).getTime(),
    monthEnd: new Date(y, m + 1, 1).getTime(),
  };
}

export function computeTotals(entries, now) {
  assertValidInput(entries, now, 'computeTotals');

  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayStart = new Date(y, m, d).getTime();
  const dayEnd = new Date(y, m, d + 1).getTime();
  const { monthStart, monthEnd } = monthRange(now);

  let todayPaise = 0;
  let monthPaise = 0;
  entries.forEach((entry, index) => {
    assertValidEntry(entry, index, 'computeTotals');
    const t = entry.createdAt;
    if (t >= monthStart && t < monthEnd) {
      const paise = toPaise(entry.amount);
      monthPaise += paise;
      if (t >= dayStart && t < dayEnd) {
        todayPaise += paise;
      }
    }
  });

  return { today: todayPaise / 100, month: monthPaise / 100 };
}

// Category names come from src/categorise.js (its own 'Other' fallback covers
// unplaceable notes), so no current-month amount is dropped. Ties on total are
// broken by plain code-unit order of the category name, which is what the
// capitalised category labels need.
export function categoryBreakdown(entries, now) {
  assertValidInput(entries, now, 'categoryBreakdown');

  const { monthStart, monthEnd } = monthRange(now);
  const paiseByCategory = new Map();
  entries.forEach((entry, index) => {
    assertValidEntry(entry, index, 'categoryBreakdown');
    const t = entry.createdAt;
    if (t >= monthStart && t < monthEnd) {
      const category = categorise(entry.note);
      paiseByCategory.set(category, (paiseByCategory.get(category) || 0) + toPaise(entry.amount));
    }
  });

  return [...paiseByCategory]
    .map(([category, paise]) => ({ category, total: paise / 100 }))
    .sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
}

export function formatRupees(n) {
  return '₹' + rupeeFormat.format(n);
}
