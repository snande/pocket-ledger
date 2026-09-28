import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');

test('manifest declares identity, scope and display', () => {
  assert.equal(manifest.name, 'Pocket Ledger');
  assert.ok(manifest.short_name);
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.background_color);
  assert.ok(manifest.theme_color);
});

test('manifest icons cover 192x192 and 512x512 with relative existing paths', () => {
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.includes('512x512'));
  for (const icon of manifest.icons) {
    assert.ok(!/^([a-z]+:|\/)/i.test(icon.src), `src must be relative: ${icon.src}`);
    assert.ok(existsSync(fileURLToPath(new URL(icon.src, root))), `missing icon: ${icon.src}`);
  }
  assert.ok(manifest.icons.every((icon) => icon.src === 'icons/icon.svg'));
});

test('index.html links the manifest and a matching theme-color', () => {
  assert.ok(html.includes('<link rel="manifest" href="./manifest.webmanifest">'));
  const meta = html.match(/<meta name="theme-color" content="([^"]*)">/);
  assert.ok(meta, 'theme-color meta missing');
  assert.equal(meta[1], manifest.theme_color);
});
