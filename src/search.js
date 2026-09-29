// Pure, like src/totals.js: no DOM, network or storage access, and the input
// array is never mutated. Matches notes such as chai, Chai and masala chai
// for the query chai.
function createdAtOf(entry) {
  return Number.isFinite(entry.createdAt) ? entry.createdAt : -Infinity;
}

function compareNewestFirst(a, b) {
  const ta = createdAtOf(a);
  const tb = createdAtOf(b);
  if (ta !== tb) return ta > tb ? -1 : 1;
  const ia = String(a.id ?? '');
  const ib = String(b.id ?? '');
  if (ia === ib) return 0;
  return ia < ib ? -1 : 1;
}

export function searchEntries(entries, query) {
  if (!Array.isArray(entries)) {
    throw new TypeError('searchEntries: entries must be an array');
  }
  if (typeof query !== 'string') return [];
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return entries
    .filter((e) => e !== null && typeof e === 'object' && typeof e.note === 'string' && e.note.toLowerCase().includes(q))
    .sort(compareNewestFirst);
}
