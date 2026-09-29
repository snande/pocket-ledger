import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync as zlibInflateSync } from 'node:zlib';

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

  const touchIcon = readPng('icons/apple-touch-icon.png');
  assert.ok(touchIcon.subarray(0, 8).equals(signature), 'apple-touch-icon.png missing PNG signature');
  assert.deepEqual(dimensions(touchIcon), { width: 180, height: 180 });
});

test('apple-touch-icon.png has no transparent pixels', () => {
  const buf = Buffer.from(readFileSync(fileURLToPath(new URL('icons/apple-touch-icon.png', root))));
  const colorType = buf.readUInt8(25);
  assert.equal(colorType, 6, 'expected an RGBA (color type 6) PNG');
  const idatChunks = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idatChunks.push(buf.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = zlibInflateSync(Buffer.concat(idatChunks));
  const width = buf.readUInt32BE(16);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel + 1; // +1 filter byte per scanline
  for (let row = 0; row < raw.length / stride; row++) {
    const rowStart = row * stride + 1; // skip filter byte (must be 0/None)
    for (let px = 0; px < width; px++) {
      const alpha = raw[rowStart + px * bytesPerPixel + 3];
      assert.equal(alpha, 255, `transparent pixel at row ${row}, col ${px}`);
    }
  }
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

test('index.html declares iOS home-screen tags and a matching apple-touch-icon', () => {
  assert.ok(
    html.includes('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">'),
    'apple-touch-icon link missing',
  );
  assert.ok(existsSync(fileURLToPath(new URL('icons/apple-touch-icon.png', root))));
  assert.ok(html.includes('<meta name="apple-mobile-web-app-capable" content="yes">'));
  assert.ok(html.includes('<meta name="mobile-web-app-capable" content="yes">'));

  const title = html.match(/<meta name="apple-mobile-web-app-title" content="([^"]*)">/);
  assert.ok(title, 'apple-mobile-web-app-title meta missing');
  assert.ok(title[1].length > 0, 'apple-mobile-web-app-title content must be non-empty');
});

test('viewport meta opts into the safe-area layout', () => {
  const viewport = html.match(/<meta name="viewport" content="([^"]*)">/);
  assert.ok(viewport, 'viewport meta missing');
  assert.ok(viewport[1].includes('viewport-fit=cover'), 'viewport meta missing viewport-fit=cover');
});
