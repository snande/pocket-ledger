import * as storage from './storage.js';
import {
  createStorageStore,
  hydrate,
  submitQuickEntry,
  ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  LOAD_ERROR_MESSAGE,
} from './app.js';
import { addEntry, setEntries, setDeleteListener } from './ui.js';

const store = createStorageStore(storage);
const form = document.getElementById('quick-entry');
const input = form.querySelector('input[type="text"]');
const errorEl = document.getElementById('entry-error');

setDeleteListener((id) => store.deleteEntry(id));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  let entry;
  try {
    entry = await submitQuickEntry(input.value, store, new Date());
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

async function start() {
  try {
    await storage.openStore();
    await hydrate(store, setEntries);
  } catch (err) {
    console.error('load failed', err);
    errorEl.textContent = LOAD_ERROR_MESSAGE;
  }
}

start();
