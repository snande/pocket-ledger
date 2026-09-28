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
    // createdAt is optional: callers that already know "now" (submitQuickEntry)
    // may pass an ISO string; otherwise the store stamps the current time itself.
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
      // Reverse first so the stable sort leaves same-timestamp entries latest-added first.
      return entries
        .filter((entry) => sameLocalDay(new Date(entry.createdAt), date))
        .reverse()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
  };
}
