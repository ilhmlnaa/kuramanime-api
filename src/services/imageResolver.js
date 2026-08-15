import * as cheerio from 'cheerio';
import { getText, BASE_URL } from './httpClient.js';
import { redisCacheStore } from './cacheStore.js';

const coverCache = new Map();
const COVER_TTL_MS = 6 * 60 * 60 * 1000;
const REDIS_COVER_TTL_SECONDS = 7 * 24 * 60 * 60;
const pendingCovers = new Map();

export function extractCover(html) {
  const $ = cheerio.load(html);
  return $('.anime__details__pic').attr('data-setbg')
    || $('.anime__details__pic img').attr('src')
    || $('meta[property="og:image"]').attr('content')
    || '';
}

export async function resolveCover(item, options = {}) {
  const key = item.id || item.url;
  const fetchText = options.fetchText || getText;
  const cached = coverCache.get(key);
  if (cached && Date.now() - cached.createdAt < COVER_TTL_MS) return cached.url;

  if (process.env.REDIS_URL) {
    const redisCover = await redisCacheStore.get(`kuramanime:v1:cover:${key}`).catch(() => null);
    if (redisCover) {
      coverCache.set(key, { url: redisCover, createdAt: Date.now() });
      return redisCover;
    }
  }

  if (pendingCovers.has(key)) return pendingCovers.get(key);

  const pending = (async () => {
    const url = item.url?.startsWith('http') ? item.url : `${BASE_URL}${item.url || ''}`;
    if (!url) return '';

    const cover = extractCover(await fetchText(url));
    coverCache.set(key, { url: cover, createdAt: Date.now() });
    if (cover && process.env.REDIS_URL) {
      await redisCacheStore.set(`kuramanime:v1:cover:${key}`, cover, REDIS_COVER_TTL_SECONDS).catch(() => {});
    }
    return cover;
  })().finally(() => pendingCovers.delete(key));

  pendingCovers.set(key, pending);
  return pending;
}

export async function enrichWithCovers(items, options = {}) {
  const concurrency = Math.max(1, options.concurrency || 5);
  const resolve = options.resolve || resolveCover;
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      let img = item.img || '';

      if (!img) {
        try {
          img = await resolve(item);
        } catch {
          img = '';
        }
      }

      results[index] = { ...item, img };
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  ));

  return results;
}
