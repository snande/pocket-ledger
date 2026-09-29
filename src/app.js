import { parseEntry } from './parse.js';
import { categorise } from './categorise.js';
import * as storage from './storage.js';
import { addEntry, setEntries, setDeleteListener, refreshSearch } from './ui.js';
import { serializeBackup, backupFilename, parseBackup, mergeEntries } from './backup.js';

export { computeTotals } from './totals.js';
export { formatAmount, formatEntry } from './format.js';

export const ERROR_MESSAGE = 'Use a format like 120 chai';
export const SAVE_ERROR_MESSAGE = 'Could not save that entry';
export const OPEN_ERROR_MESSAGE = 'Could not open saved entries';
export const LOAD_ERROR_MESSAGE = 'Could not load saved entries';
export const BACKUP_ERROR_MESSAGE = 'Could not create a backup';
export const RESTORE_ERROR_MESSAGE = 'Could not restore that backup';

// Downloads every persisted entry (read straight from storage, so no search or
// month filter applies) as a backup JSON file via a temporary <a download>.
// The object URL is revoked on a later tick: some browsers cancel the download
// if it is revoked synchronously after the click.
export async function downloadBackup(
  storageApi,
  now = () => Date.now(),
  doc = document,
  urlApi = URL,
  schedule = setTimeout,
) {
  const entries = await storageApi.listEntries();
  const stamp = now();
  const json = serializeBackup(entries, stamp);
  const url = urlApi.createObjectURL(new Blob([json], { type: 'application/json' }));
  let a;
  try {
    a = doc.createElement('a');
    a.href = url;
    a.download = backupFilename(stamp);
    doc.body.appendChild(a);
    a.click();
  } finally {
    if (a) a.remove();
    schedule(() => urlApi.revokeObjectURL(url), 0);
  }
}

export function restoreMessage(added) {
  return `Restored ${added} ${added === 1 ? 'entry' : 'entries'}`;
}

function toEpochMs(createdAt) {
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt;
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    throw new TypeError('createdAt must be a valid timestamp');
  }
  return t;
}

function fromStored({ note, ...rest }) {
  return { ...rest, label: note };
}

// Adapts the storage.js module (note, epoch-ms createdAt, oldest first) to the
// store shape the app uses (label, newest first).
export function createStorageStore(storageApi) {
  return {
    async addEntry({ amount, label, category, createdAt } = {}) {
      const saved = await storageApi.addEntry({
        amount,
        note: label,
        category,
        createdAt: createdAt === undefined ? undefined : toEpochMs(createdAt),
      });
      return fromStored(saved);
    },

    async listEntries() {
      const entries = await storageApi.listEntries();
      return entries.map(fromStored).sort((a, b) => b.createdAt - a.createdAt);
    },

    async deleteEntry(id) {
      await storageApi.deleteEntry(id);
      return true;
    },

    // Merges backup entries (storage shape) into the persisted ones via the same
    // storage module the add/delete paths use. Existing ids win, and duplicate ids
    // inside `incoming` collapse to the first one (mergeEntries keys by id).
    // Resolves to the number of ids that were not already stored.
    async restoreEntries(incoming) {
      const existing = await storageApi.listEntries();
      const known = new Set(existing.map((e) => e.id));
      const merged = mergeEntries(existing, incoming);
      await storageApi.putEntries(merged);
      return merged.filter((e) => !known.has(e.id)).length;
    },
  };
}

export async function hydrate(store, render) {
  const entries = await store.listEntries();
  render(entries);
  return entries;
}

export async function submitQuickEntry(text, store, now) {
  const parsed = parseEntry(text);
  if (parsed === null) return null;
  const { amount, label } = parsed;
  return store.addEntry({
    amount,
    label,
    category: categorise(label),
    createdAt: now.toISOString(),
  });
}

// Entry point for index.html: loads stored entries (and the totals derived from
// them) into the page, then persists every add through the storage module.
// The returned promise settles once startup hydration has finished.
export function initApp(storageApi = storage, now = () => new Date()) {
  const store = createStorageStore(storageApi);
  const form = document.getElementById('quick-entry');
  const input = form.querySelector('input[type="text"]');
  const errorEl = document.getElementById('entry-error');

  setDeleteListener((id) => store.deleteEntry(id));

  const ready = (async () => {
    try {
      await storageApi.openStore();
    } catch (err) {
      console.error('open failed', err);
      errorEl.textContent = OPEN_ERROR_MESSAGE;
      return;
    }
    try {
      await hydrate(store, setEntries);
    } catch (err) {
      console.error('load failed', err);
      errorEl.textContent = LOAD_ERROR_MESSAGE;
    }
  })();

  // A submit that arrives during startup waits for hydration, so the loaded list
  // cannot overwrite the new entry.
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await ready;
    let entry;
    try {
      entry = await submitQuickEntry(input.value, store, now());
    } catch (err) {
      console.error('save failed', err);
      errorEl.textContent = SAVE_ERROR_MESSAGE;
      input.focus();
      return;
    }
    if (entry === null) {
      errorEl.textContent = ERROR_MESSAGE;
    } else {
      errorEl.textContent = '';
      input.value = '';
      addEntry(entry);
    }
    input.focus();
  });

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('input', refreshSearch);

  const backupButton = document.getElementById('backup-button');
  if (backupButton) {
    backupButton.addEventListener('click', async () => {
      try {
        await ready;
        await downloadBackup(storageApi);
        errorEl.textContent = '';
      } catch (err) {
        console.error('backup failed', err);
        errorEl.textContent = BACKUP_ERROR_MESSAGE;
      }
    });
  }

  const restoreInput = document.getElementById('restore-input');
  if (restoreInput) {
    // Success goes to the polite status line; failures stay in the alert element.
    const statusEl = document.getElementById('restore-status') || errorEl;
    // Restores read then write storage, so they run one at a time: a second pick
    // waits for the first instead of reading the same stale entry list.
    let restoreQueue = Promise.resolve();

    const runRestore = async (file) => {
      restoreInput.disabled = true;
      statusEl.textContent = '';
      try {
        let incoming;
        try {
          incoming = parseBackup(await file.text()).entries;
        } catch (err) {
          // Only backup validation messages are user-facing; nothing was written.
          errorEl.textContent = err instanceof Error && err.message ? err.message : RESTORE_ERROR_MESSAGE;
          return;
        }
        try {
          await ready;
          const added = await store.restoreEntries(incoming);
          await hydrate(store, setEntries);
          errorEl.textContent = '';
          statusEl.textContent = restoreMessage(added);
        } catch (err) {
          console.error('restore failed', err);
          errorEl.textContent = RESTORE_ERROR_MESSAGE;
        }
      } finally {
        restoreInput.disabled = false;
        restoreInput.value = '';
      }
    };

    restoreInput.addEventListener('change', () => {
      const file = restoreInput.files && restoreInput.files[0];
      if (!file) return undefined;
      restoreQueue = restoreQueue.then(() => runRestore(file));
      return restoreQueue;
    });
  }

  return ready;
}

// Resolves to the ServiceWorkerRegistration, or null when unsupported or failed.
export async function registerServiceWorker(nav = globalThis.navigator) {
  if (!nav || !('serviceWorker' in nav)) return null;
  try {
    return await nav.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.error('service worker registration failed', err);
    return null;
  }
}

if (typeof document !== 'undefined' && document.getElementById('quick-entry')) {
  initApp();
  registerServiceWorker();
}
