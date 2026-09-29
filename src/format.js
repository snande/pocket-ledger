const rupeeFormat = new Intl.NumberFormat('en-IN');

export function formatAmount(amount) {
  return '₹' + rupeeFormat.format(amount);
}

export function formatEntry(entry) {
  return `${formatAmount(entry.amount)} ${entry.label} ${entry.category}`;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// createdAt is an ISO string or epoch ms; an unparseable value formats as ''.
export function formatDate(createdAt) {
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt;
  return typeof t === 'number' && Number.isFinite(t) ? dateFormat.format(new Date(t)) : '';
}
