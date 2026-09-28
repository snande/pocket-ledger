export const CATEGORY_KEYWORDS = {
  Food: ['chai', 'tea', 'coffee', 'lunch', 'dinner', 'breakfast', 'snacks'],
  Transport: ['petrol', 'auto', 'cab', 'uber', 'ola', 'bus', 'metro', 'train'],
  Groceries: ['milk', 'vegetables', 'groceries'],
  Bills: ['recharge', 'electricity', 'rent'],
};

const FALLBACK_CATEGORY = 'Other';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function categorise(label) {
  if (typeof label !== 'string') return FALLBACK_CATEGORY;
  const text = label.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(text)) return category;
    }
  }
  return FALLBACK_CATEGORY;
}
