import test from 'node:test';
import assert from 'node:assert/strict';
import { createCacheMiddleware } from '../src/middleware/cache.js';

function createResponse() {
  return {
    headers: {},
    body: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createStore(initial = new Map()) {
  return {
    values: initial,
    writes: [],
    deletes: [],
    async get(key) {
      return this.values.get(key) ?? null;
    },
    async set(key, value, ttl) {
      this.values.set(key, value);
      this.writes.push({ key, value, ttl });
    },
    async delete(key) {
      this.values.delete(key);
      this.deletes.push(key);
    },
  };
}

test('cache hit uses normalized query key and returns cached response', async () => {
  const store = createStore(new Map([
    ['kuramanime:v1:GET:/api/anime?a=1&b=2', JSON.stringify({ success: true, data: 'cached' })],
  ]));
  const middleware = createCacheMiddleware({ store, ttl: 60 });
  const req = { method: 'GET', path: '/api/anime', query: { b: '2', a: '1' }, get: () => undefined };
  const res = createResponse();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.deepEqual(res.body, { success: true, data: 'cached' });
  assert.equal(res.headers['X-Cache'], 'HIT');
});

test('noCache bypasses cache read and write', async () => {
  const store = createStore();
  const middleware = createCacheMiddleware({ store, ttl: 60 });
  const req = { method: 'GET', path: '/api/home', query: { noCache: 'true' }, get: () => undefined };
  const res = createResponse();

  await middleware(req, res, () => res.json({ success: true }));

  assert.equal(res.headers['X-Cache'], 'BYPASS');
  assert.equal(store.writes.length, 0);
});

test('refreshCache skips read and replaces the cache value', async () => {
  const key = 'kuramanime:v1:GET:/api/home';
  const store = createStore(new Map([[key, JSON.stringify({ stale: true })]]));
  const middleware = createCacheMiddleware({ store, ttl: 30 });
  const req = { method: 'GET', path: '/api/home', query: { refreshCache: 'true' }, get: () => undefined };
  const res = createResponse();

  await middleware(req, res, () => res.json({ fresh: true }));

  assert.deepEqual(res.body, { fresh: true });
  assert.equal(res.headers['X-Cache'], 'REFRESH');
  assert.deepEqual(store.deletes, [key]);
  assert.deepEqual(store.writes, [{ key, value: JSON.stringify({ fresh: true }), ttl: 30 }]);
});

test('cache failures fall through to the upstream handler', async () => {
  const store = {
    async get() { throw new Error('redis unavailable'); },
    async set() { throw new Error('redis unavailable'); },
    async delete() { throw new Error('redis unavailable'); },
  };
  const middleware = createCacheMiddleware({ store, ttl: 60 });
  const req = { method: 'GET', path: '/api/home', query: {}, get: () => undefined };
  const res = createResponse();

  await middleware(req, res, () => res.json({ success: true }));

  assert.deepEqual(res.body, { success: true });
  assert.equal(res.headers['X-Cache'], 'MISS');
});
