import { categorise } from './categorise.js';

function toPaise(amount) {
  return Math.round(amount * 100);
}

function assertValidEntry(entry, index) {
  if (entry === null || typeof entry !== 'object') {
    throw new TypeError(`monthlyComparison: entries[${index}] must be an object`);
  }
  if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount)) {
    throw new TypeError(`monthlyComparison: entries[${index}].amount must be a finite number`);
  }
  if (typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt)) {
    throw new TypeError(`monthlyComparison: entries[${index}].createdAt must be a finite number (epoch ms)`);
  }
}

function add(map, category, paise) {
  map.set(category, (map.get(category) || 0) + paise);
}

// Pure data layer: per-category totals for the local month containing `now`
// versus the previous local month. Category names come from src/categorise.js.
export function monthlyComparison(entries, now) {
  if (!Array.isArray(entries)) {
    throw new TypeError('monthlyComparison: entries must be an array');
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('monthlyComparison: now must be a valid Date');
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const prevStart = new Date(year, month - 1, 1).getTime();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();

  const current = new Map();
  const previous = new Map();
  entries.forEach((entry, index) => {
    assertValidEntry(entry, index);
    const t = entry.createdAt;
    if (t >= monthStart && t < monthEnd) {
      add(current, categorise(entry.note), toPaise(entry.amount));
    } else if (t >= prevStart && t < monthStart) {
      add(previous, categorise(entry.note), toPaise(entry.amount));
    }
  });

  const names = new Set([...current.keys(), ...previous.keys()]);
  const categories = [...names].map((category) => {
    const totalPaise = current.get(category) || 0;
    const previousPaise = previous.get(category) || 0;
    const changePaise = totalPaise - previousPaise;
    return {
      category,
      total: totalPaise / 100,
      previousTotal: previousPaise / 100,
      change: changePaise / 100,
      changePercent: previousPaise > 0 ? (changePaise / previousPaise) * 100 : null,
    };
  });
  categories.sort(
    (a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
  );

  return { year, month, categories };
}
