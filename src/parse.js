const AMOUNT_FIRST = /^\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)\s+(.+)$/i;
const AMOUNT_LAST = /^(.+?)\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)\s*$/i;

export function parseEntry(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;

  let amountText;
  let rawLabel;
  const first = AMOUNT_FIRST.exec(text);
  if (first) {
    [, amountText, rawLabel] = first;
  } else {
    const last = AMOUNT_LAST.exec(text);
    if (!last) return null;
    [, rawLabel, amountText] = last;
  }

  const amount = Number(amountText);
  if (!(amount > 0)) return null;

  const label = rawLabel.trim().replace(/\s+/g, ' ');
  if (label === '') return null;

  return { amount, label };
}
