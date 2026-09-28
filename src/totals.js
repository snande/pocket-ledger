const rupeeFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toPaise(amount) {
  return Math.round(amount * 100);
}

export function computeTotals(entries, now) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayStart = new Date(y, m, d).getTime();
  const dayEnd = new Date(y, m, d + 1).getTime();
  const monthStart = new Date(y, m, 1).getTime();
  const monthEnd = new Date(y, m + 1, 1).getTime();

  let todayPaise = 0;
  let monthPaise = 0;
  for (const entry of entries) {
    const t = entry.createdAt;
    if (t >= monthStart && t < monthEnd) {
      const paise = toPaise(entry.amount);
      monthPaise += paise;
      if (t >= dayStart && t < dayEnd) {
        todayPaise += paise;
      }
    }
  }

  return { today: todayPaise / 100, month: monthPaise / 100 };
}

export function formatRupees(n) {
  return '₹' + rupeeFormat.format(n);
}
