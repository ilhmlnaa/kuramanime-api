import * as cheerio from 'cheerio';
import { getText, BASE_URL } from './httpClient.js';
import { redisCacheStore } from './cacheStore.js';

const coverCache = new Map();
const COVER_TTL_MS = 6 * 60 * 60 * 1000;
const REDIS_COVER_TTL_SECONDS = 7 * 24 * 60 * 60;
const pendingCovers = new Map();

export function extractCover(html) {
  const $ = cheerio.load(html);
  const cover = $('.anime__details__pic').attr('data-setbg')
    || $('.anime__details__pic img').attr('src')
    || $('meta[property="og:image"]').attr('content')
    || '';
  const ratingMatch = $('.anime__details__rating span, .fa-star').parent().text().trim().match(/[\d.]+/);
  const rating = ratingMatch ? ratingMatch[0] : null;
  return { cover, rating };
}

export async function resolveCover(item, options = {}) {
  const key = item.id || item.url;
  const fetchText = options.fetchText || getText;
  const cached = coverCache.get(key);
  if (cached && Date.now() - cached.createdAt < COVER_TTL_MS) return cached.data;

  if (process.env.REDIS_URL) {
    const cachedJson = await redisCacheStore.get(`kuramanime:v1:meta:${key}`).catch(() => null);
    if (cachedJson) {
      const data = JSON.parse(cachedJson);
      coverCache.set(key, { data, createdAt: Date.now() });
      return data;
    }
  }

  if (pendingCovers.has(key)) return pendingCovers.get(key);

  const pending = (async () => {
    const url = item.url?.startsWith('http') ? item.url : `${BASE_URL}${item.url || ''}`;
    if (!url) return { cover: '', rating: null };

    const data = extractCover(await fetchText(url));
    coverCache.set(key, { data, createdAt: Date.now() });
    if (process.env.REDIS_URL) {
      await redisCacheStore.set(`kuramanime:v1:meta:${key}`, JSON.stringify(data), REDIS_COVER_TTL_SECONDS).catch(() => {});
    }
    return data;
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
          const { cover, rating } = await resolve(item);
          img = cover;
          item.rating = rating;
        } catch {
          img = '';
          item.rating = null;
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
