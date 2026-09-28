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
    async addEntry({ amount, label, category }) {
      const entry = {
        id: crypto.randomUUID(),
        amount,
        label,
        category,
        createdAt: new Date().toISOString(),
      };
      entries.push(entry);
      return entry;
    },

    async listEntriesForDay(date) {
      return entries
        .filter((entry) => sameLocalDay(new Date(entry.createdAt), date))
        .reverse();
    },
  };
}
