function addEntry(list, text) {
  return [text, ...list];
}

if (typeof globalThis !== 'undefined') {
  globalThis.addEntry = addEntry;
}
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
    li.textContent = text;
    listEl.prepend(li);
    input.value = '';
    input.focus();
  });
}
