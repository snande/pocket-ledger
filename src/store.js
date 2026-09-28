function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// In-memory entry store. Every method returns a Promise so a persistent
// store (e.g. IndexedDB) can be swapped in without touching callers.
export function createMemoryStore() {
  const entries = [];

  return {
    async addEntry({ amount, label, category, createdAt } = {}) {
      const entry = {
        id: crypto.randomUUID(),
        amount,
        label,
        category,
        createdAt: createdAt === undefined ? new Date().toISOString() : createdAt,
      };
      entries.push(entry);
      return entry;
    },

    async listEntriesForDay(date) {
      return entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => sameLocalDay(new Date(entry.createdAt), date))
        .sort(
          (a, b) =>
            new Date(b.entry.createdAt) - new Date(a.entry.createdAt) || b.index - a.index,
        )
        .map(({ entry }) => entry);
    },
  };
}
