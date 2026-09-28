import { createMemoryStore } from './store.js';
import { submitQuickEntry, formatEntry, ERROR_MESSAGE } from './app.js';

const store = createMemoryStore();
const form = document.getElementById('quick-entry');
const input = form.querySelector('input[type="text"]');
const errorEl = document.getElementById('entry-error');
const listEl = document.getElementById('today-list');

async function render() {
  const entries = await store.listEntriesForDay(new Date());
  listEl.replaceChildren(
    ...entries.map((entry) => {
      const li = document.createElement('li');
      li.textContent = formatEntry(entry);
      return li;
    }),
  );
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const entry = await submitQuickEntry(input.value, store, new Date());
  if (entry === null) {
    errorEl.textContent = ERROR_MESSAGE;
  } else {
    errorEl.textContent = '';
    input.value = '';
  }
  await render();
  input.focus();
});

render();
