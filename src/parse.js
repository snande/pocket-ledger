// Minimal stand-in until #4 lands; replace this file with #4's parseEntry/categorise.
const CATEGORY_KEYWORDS = {
  Food: ['chai', 'coffee', 'tea', 'lunch', 'dinner', 'breakfast', 'snack'],
  Transport: ['auto', 'bus', 'metro', 'cab', 'taxi', 'fuel', 'petrol'],
};

export function parseEntry(text) {
  const match = /^\s*(\d+(?:\.\d+)?)\s+(\S.*?)\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const amount = Number(match[1]);
  if (!(amount > 0)) return null;
  return { amount, label: match[2] };
}

export function categorise(label) {
  const words = label.toLowerCase().split(/\s+/);
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((word) => keywords.includes(word))) return category;
  }
  return 'Other';
}
