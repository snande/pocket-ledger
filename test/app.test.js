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

test('quick-entry form directly contains exactly one text input', () => {
  const html = read('index.html');
  const form = html.match(/<form[^>]*id="quick-entry"[^>]*>([\s\S]*?)<\/form>/);
  assert.ok(form, 'form#quick-entry with a closing tag');
  const inputs = form[1].match(/<input\b[^>]*>/g) ?? [];
  assert.equal(inputs.length, 1);
  assert.match(inputs[0], /type="text"/);
  // no other input anywhere on the page: the form's input is the single one
  assert.equal((html.match(/<input\b/g) ?? []).length, 1);
});

test('#entry-error and #today-list sit outside the form', () => {
  const html = read('index.html');
  const form = html.match(/<form[^>]*id="quick-entry"[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(form, /id="entry-error"/);
  assert.doesNotMatch(form, /id="today-list"/);
});
