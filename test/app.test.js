import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const srcFiles = readdirSync(new URL('../src/', import.meta.url))
  .filter((name) => name.endsWith('.js'))
  .map((name) => `src/${name}`);

test('page files reference no absolute http(s) URLs', () => {
  for (const name of ['index.html', 'styles.css', ...srcFiles]) {
    assert.doesNotMatch(read(name), /https?:\/\//i, name);
  }
});

test('index.html wires up stylesheet, module script, form, error and list', () => {
  const html = read('index.html');
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /<script[^>]*type="module"[^>]*src="\.\/src\/main\.js"/);
  assert.match(html, /<form[^>]*id="quick-entry"/);
  assert.match(html, /<p[^>]*id="entry-error"/);
  assert.match(html, /<ul[^>]*id="today-list"/);
  assert.match(html, /<button[^>]*type="submit"/);
});

test('quick-entry form holds a single text input', () => {
  const html = read('index.html');
  const form = html.match(/<form[^>]*id="quick-entry"[\s\S]*?<\/form>/)[0];
  assert.equal(form.match(/<input\b/g).length, 1);
  assert.match(form, /<input[^>]*type="text"/);
});
