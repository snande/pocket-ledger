import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../app.js';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('addEntry prepends text and returns a new array', () => {
  const { addEntry } = globalThis;
  assert.deepEqual(addEntry([], '120 chai'), ['120 chai']);
  assert.deepEqual(addEntry(['a'], 'b'), ['b', 'a']);
});

test('addEntry trims the text before prepending', () => {
  const { addEntry } = globalThis;
  assert.deepEqual(addEntry([], '  120 chai  '), ['120 chai']);
});

test('addEntry ignores empty and whitespace-only text', () => {
  const { addEntry } = globalThis;
  assert.deepEqual(addEntry(['a'], ''), ['a']);
  assert.deepEqual(addEntry(['a'], '   \t '), ['a']);
});

test('addEntry does not mutate its input', () => {
  const { addEntry } = globalThis;
  const list = ['a'];
  const next = addEntry(list, 'b');
  assert.deepEqual(list, ['a']);
  assert.notEqual(next, list);
  assert.notEqual(addEntry(list, ''), list);
});

test('shell files reference no absolute http(s) URLs', () => {
  for (const name of ['index.html', 'app.js', 'styles.css']) {
    assert.doesNotMatch(read(name), /https?:\/\//i, name);
  }
});

test('index.html wires up assets, input, button and list', () => {
  const html = read('index.html');
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /id="entry-input"/);
  assert.match(html, /id="entry-list"/);
  assert.match(html, /<button[^>]*type="submit"/);
});
