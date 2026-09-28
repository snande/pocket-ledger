import { createMemoryStore } from './store.js';
import { submitQuickEntry, ERROR_MESSAGE } from './app.js';
import { render, addEntry, entries, setDeleteListener } from './ui.js';

const store = createMemoryStore();
const form = document.getElementById('quick-entry');
const input = form.querySelector('input[type="text"]');
const errorEl = document.getElementById('entry-error');

setDeleteListener((id) => store.deleteEntry(id));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const entry = await submitQuickEntry(input.value, store, new Date());
  if (entry === null) {
    errorEl.textContent = ERROR_MESSAGE;
  } else {
    errorEl.textContent = '';
    input.value = '';
    addEntry(entry);
  }
  input.focus();
});

store.listEntries().then((existing) => {
  entries.push(...existing);
  render(entries);
});
