function toDate(now, fn) {
  const date = now instanceof Date ? now : new Date(now);
  if (
    (!(now instanceof Date) && (typeof now !== 'number' || !Number.isFinite(now))) ||
    Number.isNaN(date.getTime())
  ) {
    throw new TypeError(`${fn}: now must be a valid Date or epoch ms number`);
  }
  return date;
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

export function serializeBackup(entries, now) {
  if (!Array.isArray(entries)) {
    throw new TypeError('serializeBackup: entries must be an array');
  }
  const exportedAt = toDate(now, 'serializeBackup').getTime();
  return JSON.stringify(
    { app: 'pocket-ledger', version: 1, exportedAt, entries: entries.slice() },
    null,
    2,
  );
}

export function backupFilename(now) {
  const d = toDate(now, 'backupFilename');
  return `pocket-ledger-backup-${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
