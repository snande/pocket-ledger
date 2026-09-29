export function searchEntries(entries, query) {
  if (!Array.isArray(entries)) {
    throw new TypeError('searchEntries: entries must be an array');
  }
  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return [];
  return entries
    .filter((e) => typeof e?.note === 'string' && e.note.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
}
