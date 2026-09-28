function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function createMemoryStore() {
  const entries = [];

  return {
    async addEntry({ amount, label, category }, now = new Date()) {
      const entry = {
        id: crypto.randomUUID(),
        amount,
        label,
        category,
        createdAt: now.toISOString(),
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
            b.entry.createdAt.localeCompare(a.entry.createdAt) ||
            b.index - a.index,
        )
        .map(({ entry }) => entry);
    },
  };
}
