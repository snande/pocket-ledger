import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerServiceWorker } from '../src/app.js';

const root = new URL('../', import.meta.url);
const readRoot = (path) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
const swSource = readRoot('sw.js');

function loadWorker({ cacheKeys = [], cached = {}, network } = {}) {
  const listeners = {};
  const calls = { added: null, opened: null, deleted: [], skipWaiting: 0, claim: 0 };
  const caches = {
    open: async (name) => {
      calls.opened = name;
      return { addAll: async (urls) => { calls.added = urls; } };
    },
    keys: async () => cacheKeys,
    delete: async (name) => { calls.deleted.push(name); return true; },
    match: async (req) => cached[typeof req === 'string' ? req : req.url],
  };
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => { calls.skipWaiting += 1; return Promise.resolve(); },
    clients: { claim: () => { calls.claim += 1; return Promise.resolve(); } },
    location: { origin: 'http://localhost:8000' },
  };
  const fetchFn = network ?? (async () => { throw new TypeError('offline'); });
  const context = vm.createContext({ self, caches, fetch: fetchFn, URL, console });
  vm.runInContext(`${swSource}\nthis.__exports = { CACHE, PRECACHE_URLS };`, context);
  return { listeners, calls, exports: context.__exports };
}

async function dispatch(listener, event) {
  let pending;
  listener({ ...event, waitUntil: (p) => { pending = p; }, respondWith: (p) => { pending = p; } });
  return pending;
}

const req = (url, init = {}) => ({ url, method: 'GET', mode: 'cors', ...init });

test('cache name is versioned with the pocket-ledger-shell- prefix', () => {
  const { exports } = loadWorker();
  assert.equal(exports.CACHE, 'pocket-ledger-shell-v2');
});

test('PRECACHE_URLS includes both new PNG icon paths', () => {
  const { PRECACHE_URLS } = loadWorker().exports;
  assert.ok(PRECACHE_URLS.includes('./icons/icon-192.png'), 'PRECACHE_URLS missing icon-192.png');
  assert.ok(PRECACHE_URLS.includes('./icons/icon-512.png'), 'PRECACHE_URLS missing icon-512.png');
});

test('PRECACHE_URLS starts with the five shell entries and every entry exists on disk', () => {
  const urls = [...loadWorker().exports.PRECACHE_URLS];
  assert.deepEqual(urls.slice(0, 5), [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './manifest.webmanifest',
  ]);
  for (const url of urls) {
    assert.ok(url.startsWith('./'), `must be relative: ${url}`);
    if (url === './') continue;
    assert.ok(existsSync(fileURLToPath(new URL(url, root))), `missing file: ${url}`);
  }
});

test('PRECACHE_URLS covers the script index.html loads and every module reachable from it', () => {
  const { PRECACHE_URLS } = loadWorker().exports;
  const entry = readRoot('index.html').match(/<script[^>]*src="(\.\/[^"]+)"/);
  assert.ok(entry, 'index.html script tag');
  const seen = new Set();
  const walk = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const base = new URL(path, root);
    const text = readFileSync(fileURLToPath(base), 'utf8');
    for (const m of text.matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) {
      const resolved = new URL(m[1], base);
      walk(`./${resolved.href.slice(root.href.length)}`);
    }
  };
  walk(entry[1]);
  assert.ok(seen.size > 2, 'expected root app.js plus its imported modules');
  for (const path of seen) {
    assert.ok(PRECACHE_URLS.includes(path), `not precached: ${path}`);
  }
});

test('install precaches the list into CACHE and then skips waiting', async () => {
  const { listeners, calls, exports } = loadWorker();
  await dispatch(listeners.install, {});
  assert.equal(calls.opened, exports.CACHE);
  assert.deepEqual(calls.added, exports.PRECACHE_URLS);
  assert.equal(calls.skipWaiting, 1);
});

test('activate deletes stale pocket-ledger-shell- caches, keeps the current one, then claims clients', async () => {
  const { listeners, calls, exports } = loadWorker({
    cacheKeys: ['pocket-ledger-shell-v0', 'pocket-ledger-shell-v2', 'other-cache', 'pocket-ledger-shell-old'],
  });
  assert.equal(exports.CACHE, 'pocket-ledger-shell-v2');
  await dispatch(listeners.activate, {});
  assert.deepEqual([...calls.deleted].sort(), ['pocket-ledger-shell-old', 'pocket-ledger-shell-v0']);
  assert.ok(!calls.deleted.includes('pocket-ledger-shell-v2'));
  assert.ok(!calls.deleted.includes('other-cache'));
  assert.equal(calls.claim, 1);
});

test('fetch answers same-origin GET from cache first', async () => {
  const hit = { body: 'cached' };
  let networkCalls = 0;
  const { listeners } = loadWorker({
    cached: { 'http://localhost:8000/styles.css': hit },
    network: async () => { networkCalls += 1; return { body: 'net' }; },
  });
  const res = await dispatch(listeners.fetch, { request: req('http://localhost:8000/styles.css') });
  assert.equal(res, hit);
  assert.equal(networkCalls, 0);
});

test('fetch falls back to the network on a cache miss', async () => {
  const net = { body: 'net' };
  const { listeners } = loadWorker({ network: async () => net });
  const res = await dispatch(listeners.fetch, { request: req('http://localhost:8000/other.txt') });
  assert.equal(res, net);
});

test('offline navigation misses fall back to the cached ./index.html', async () => {
  const shell = { body: 'shell' };
  const { listeners } = loadWorker({ cached: { './index.html': shell } });
  const res = await dispatch(listeners.fetch, {
    request: req('http://localhost:8000/some/route', { mode: 'navigate' }),
  });
  assert.equal(res, shell);
});

test('offline non-navigation misses reject instead of returning the shell', async () => {
  const { listeners } = loadWorker({ cached: { './index.html': { body: 'shell' } } });
  await assert.rejects(dispatch(listeners.fetch, { request: req('http://localhost:8000/x.json') }));
});

test('fetch does not intercept non-GET or cross-origin requests', () => {
  const { listeners } = loadWorker();
  for (const request of [
    req('http://localhost:8000/', { method: 'POST' }),
    req('https://example.com/lib.js'),
  ]) {
    let responded = false;
    listeners.fetch({ request, respondWith: () => { responded = true; } });
    assert.equal(responded, false, `${request.method} ${request.url}`);
  }
});

test('registerServiceWorker registers ./sw.js with scope ./ and resolves to the registration', async () => {
  const calls = [];
  const registration = { scope: './' };
  const nav = {
    serviceWorker: { register: (...args) => { calls.push(args); return Promise.resolve(registration); } },
  };
  assert.equal(await registerServiceWorker(nav), registration);
  assert.deepEqual(calls, [['./sw.js', { scope: './' }]]);
});

test('registerServiceWorker resolves to null without serviceWorker support', async () => {
  assert.equal(await registerServiceWorker({}), null);
  assert.equal(await registerServiceWorker(null), null);
});

test('registerServiceWorker resolves to null when registration fails', async () => {
  const nav = { serviceWorker: { register: () => Promise.reject(new Error('nope')) } };
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await registerServiceWorker(nav), null);
  } finally {
    console.error = original;
  }
});
