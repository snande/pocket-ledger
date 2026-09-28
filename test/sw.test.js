import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerServiceWorker } from '../src/app.js';

const root = new URL('../', import.meta.url);
const swSource = readFileSync(fileURLToPath(new URL('sw.js', root)), 'utf8');

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
  assert.match(exports.CACHE, /^pocket-ledger-shell-v\d+$/);
});

test('PRECACHE_URLS is relative and every entry exists on disk', () => {
  const { exports } = loadWorker();
  const urls = exports.PRECACHE_URLS;
  for (const required of ['./', './index.html', './styles.css', './manifest.webmanifest']) {
    assert.ok(urls.includes(required), `missing ${required}`);
  }
  for (const url of urls) {
    assert.ok(url.startsWith('./'), `must be relative: ${url}`);
    if (url === './') continue;
    assert.ok(existsSync(fileURLToPath(new URL(url, root))), `missing file: ${url}`);
  }
});

test('PRECACHE_URLS covers every module reachable from src/app.js', () => {
  const { exports } = loadWorker();
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(fileURLToPath(new URL(`src/${file}`, root)), 'utf8');
    for (const m of text.matchAll(/from '\.\/([\w-]+\.js)'/g)) walk(m[1]);
  };
  walk('app.js');
  assert.ok(seen.size > 1);
  for (const file of seen) {
    assert.ok(exports.PRECACHE_URLS.includes(`./src/${file}`), `not precached: src/${file}`);
  }
});

test('install precaches the list into CACHE and then skips waiting', async () => {
  const { listeners, calls, exports } = loadWorker();
  await dispatch(listeners.install, {});
  assert.equal(calls.opened, exports.CACHE);
  assert.deepEqual(calls.added, exports.PRECACHE_URLS);
  assert.equal(calls.skipWaiting, 1);
});

test('activate deletes only stale pocket-ledger-shell- caches, then claims clients', async () => {
  const { CACHE } = loadWorker().exports;
  const { listeners, calls } = loadWorker({
    cacheKeys: ['pocket-ledger-shell-v0', CACHE, 'other-cache', 'pocket-ledger-shell-old'],
  });
  await dispatch(listeners.activate, {});
  assert.deepEqual(calls.deleted.sort(), ['pocket-ledger-shell-old', 'pocket-ledger-shell-v0']);
  assert.ok(!calls.deleted.includes(CACHE));
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

test('fetch does not intercept non-GET or cross-origin requests', async () => {
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

test('registerServiceWorker registers ./sw.js with scope ./ when supported', async () => {
  const calls = [];
  const nav = { serviceWorker: { register: (...args) => { calls.push(args); return Promise.resolve(); } } };
  await registerServiceWorker(nav);
  assert.deepEqual(calls, [['./sw.js', { scope: './' }]]);
});

test('registerServiceWorker is a no-op without serviceWorker support', () => {
  assert.equal(registerServiceWorker({}), null);
  assert.equal(registerServiceWorker(null), null);
});

test('registerServiceWorker swallows registration failures', async () => {
  const nav = { serviceWorker: { register: () => Promise.reject(new Error('nope')) } };
  const original = console.error;
  console.error = () => {};
  try {
    await registerServiceWorker(nav);
  } finally {
    console.error = original;
  }
});
