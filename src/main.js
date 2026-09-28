import { submitQuickEntry, formatEntry } from './app.js';
import { createMemoryStore } from './store.js';

const store = createMemoryStore();
const form = document.getElementById('quick-entry');
const input = form.querySelector('input');
const list = document.getElementById('today-list');
const error = document.getElementById('entry-error');

async function render() {
  const entries = await store.listEntriesForDay(new Date());
  list.replaceChildren(
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
  if (entry) {
    input.value = '';
    error.textContent = '';
    await render();
  } else {
    error.textContent = 'Use a format like 120 chai';
  }
});

render();
