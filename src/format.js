const rupeeFormat = new Intl.NumberFormat('en-IN');

export function formatAmount(amount) {
  return '₹' + rupeeFormat.format(amount);
}

export function formatEntry(entry) {
  return `${formatAmount(entry.amount)} ${entry.label} ${entry.category}`;
}
