const rupeeFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toPaise(amount) {
  return Math.round(amount * 100);
}

function assertValidEntry(entry, index) {
  if (entry === null || typeof entry !== 'object') {
    throw new TypeError(`computeTotals: entries[${index}] must be an object`);
  }
  if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount)) {
    throw new TypeError(`computeTotals: entries[${index}].amount must be a finite number`);
  }
  if (typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt)) {
    throw new TypeError(`computeTotals: entries[${index}].createdAt must be a finite number (epoch ms)`);
  }
}

export function computeTotals(entries, now) {
  if (!Array.isArray(entries)) {
    throw new TypeError('computeTotals: entries must be an array');
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('computeTotals: now must be a valid Date');
  }

  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayStart = new Date(y, m, d).getTime();
  const dayEnd = new Date(y, m, d + 1).getTime();
  const monthStart = new Date(y, m, 1).getTime();
  const monthEnd = new Date(y, m + 1, 1).getTime();

  let todayPaise = 0;
  let monthPaise = 0;
  entries.forEach((entry, index) => {
    assertValidEntry(entry, index);
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

export function formatRupees(n) {
  return '₹' + rupeeFormat.format(n);
}
