import { redisCacheStore } from '../services/cacheStore.js';

const CACHE_PREFIX = 'kuramanime:v1';
const CONTROL_PARAMS = new Set(['noCache', 'refreshCache']);
const CACHE_TIMEOUT_MS = 1000;

function enabled(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

function cacheKey(req) {
  const query = new URLSearchParams();
  Object.entries(req.query || {})
    .filter(([name]) => !CONTROL_PARAMS.has(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([name, value]) => {
      const values = Array.isArray(value) ? [...value].sort() : [value];
      values.forEach((item) => query.append(name, String(item)));
    });

  const suffix = query.toString();
  return `${CACHE_PREFIX}:${req.method}:${req.path}${suffix ? `?${suffix}` : ''}`;
}

export function createCacheMiddleware({ store = redisCacheStore, ttl }) {
  return async function cacheMiddleware(req, res, next) {
    if (!process.env.REDIS_URL && store === redisCacheStore) return next();

    const bypass = enabled(req.query?.noCache) || /no-cache/.test(req.get?.('Cache-Control') || '');
    const refresh = enabled(req.query?.refreshCache);
    const key = cacheKey(req);

    if (bypass) {
      res.set('X-Cache', 'BYPASS');
      return next();
    }

    if (refresh) {
      res.set('X-Cache', 'REFRESH');
      try {
        await Promise.race([
          store.delete(key),
          new Promise((_, reject) => setTimeout(() => reject(new Error('cache timeout')), CACHE_TIMEOUT_MS)),
        ]);
      } catch {}
    } else {
      try {
        const cached = await Promise.race([
          store.get(key),
          new Promise((_, reject) => setTimeout(() => reject(new Error('cache timeout')), CACHE_TIMEOUT_MS)),
        ]);
        if (cached) {
          res.set('X-Cache', 'HIT');
          return res.json(JSON.parse(cached));
        }
      } catch {}
      res.set('X-Cache', 'MISS');
    }

    const sendJson = res.json.bind(res);
    res.json = (body) => {
      if (body?.success !== false) {
        Promise.resolve(store.set(key, JSON.stringify(body), ttl)).catch(() => {});
      }
      return sendJson(body);
    };

    return next();
  };
}

export const cache = (ttl) => createCacheMiddleware({ ttl });
