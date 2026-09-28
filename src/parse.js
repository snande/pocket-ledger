const AMOUNT_FIRST = /^\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)\s+(.+)$/i;
const AMOUNT_LAST = /^(.+?)\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)\s*$/i;

// Amount-first wins when both ends look numeric ("120 chai 50" -> 120, "chai 50").
// A bare number ("120") matches neither regex because each requires a label plus whitespace.
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
