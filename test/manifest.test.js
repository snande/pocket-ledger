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

  // Android's installability check requires raster PNG icons at 192x192 and
  // 512x512; each entry below is asserted by its src, sizes and type fields.
  const png192 = manifest.icons.find(
    (icon) => icon.src === 'icons/icon-192.png' && icon.sizes === '192x192' && icon.type === 'image/png',
  );
  assert.ok(png192, 'missing 192x192 image/png icon at icons/icon-192.png');

  const png512 = manifest.icons.filter(
    (icon) => icon.src === 'icons/icon-512.png' && icon.sizes === '512x512' && icon.type === 'image/png',
  );
  assert.ok(png512.length > 0, 'missing 512x512 image/png icon at icons/icon-512.png');
  assert.ok(
    png512.some((icon) => (icon.purpose || '').includes('maskable')),
    'need a 512x512 image/png icon whose purpose includes maskable',
  );
});

test('PNG icons have a valid signature and IHDR dimensions', () => {
  const readPng = (path) => Buffer.from(readFileSync(fileURLToPath(new URL(path, root))));
  const dimensions = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const icon192 = readPng('icons/icon-192.png');
  assert.ok(icon192.subarray(0, 8).equals(signature), 'icon-192.png missing PNG signature');
  assert.deepEqual(dimensions(icon192), { width: 192, height: 192 });

  const icon512 = readPng('icons/icon-512.png');
  assert.ok(icon512.subarray(0, 8).equals(signature), 'icon-512.png missing PNG signature');
  assert.deepEqual(dimensions(icon512), { width: 512, height: 512 });
});

test('manifest identity fields required for Android installability resolve within the app directory', () => {
  assert.ok(manifest.name, 'manifest name must be non-empty');
  assert.ok(manifest.short_name, 'manifest short_name must be non-empty');
  assert.equal(manifest.display, 'standalone');
  assert.ok(
    !/^([a-z]+:|\/)/i.test(manifest.start_url),
    `start_url must resolve inside the app directory: ${manifest.start_url}`,
  );
  assert.ok(
    !/^([a-z]+:|\/)/i.test(manifest.scope),
    `scope must resolve inside the app directory: ${manifest.scope}`,
  );
  assert.ok(manifest.theme_color, 'manifest theme_color must be set');
  assert.ok(manifest.background_color, 'manifest background_color must be set');
});

test('index.html links the manifest and a matching theme-color', () => {
  assert.ok(html.includes('<link rel="manifest" href="./manifest.webmanifest">'));
  const meta = html.match(/<meta name="theme-color" content="([^"]*)">/);
  assert.ok(meta, 'theme-color meta missing');
  assert.equal(meta[1], manifest.theme_color);
});
