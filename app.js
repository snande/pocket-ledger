function addEntry(list, text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') return [...list];
  return [trimmed, ...list];
}

// globalThis (not window) so a Node ESM test can reach it; browsers already expose top-level functions as globals.
globalThis.addEntry = addEntry;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { addEntry };
}

if (typeof document !== 'undefined') {
  let entries = [];
  const form = document.getElementById('entry-form');
  const input = document.getElementById('entry-input');
  const listEl = document.getElementById('entry-list');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const text = input.value.trim();
    if (text === '') return;
    entries = addEntry(entries, text);
    const li = document.createElement('li');
    li.textContent = entries[0];
    listEl.prepend(li);
    input.value = '';
    input.focus();
  });
}
