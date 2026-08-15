import * as cheerio from 'cheerio';
import { getText, BASE_URL } from './httpClient.js';

const coverCache = new Map();
const COVER_TTL_MS = 6 * 60 * 60 * 1000;

export function extractCover(html) {
  const $ = cheerio.load(html);
  return $('.anime__details__pic').attr('data-setbg')
    || $('.anime__details__pic img').attr('src')
    || $('meta[property="og:image"]').attr('content')
    || '';
}

export async function resolveCover(item) {
  const key = item.id || item.url;
  const cached = coverCache.get(key);
  if (cached && Date.now() - cached.createdAt < COVER_TTL_MS) return cached.url;

  const url = item.url?.startsWith('http') ? item.url : `${BASE_URL}${item.url || ''}`;
  if (!url) return '';

  const cover = extractCover(await getText(url));
  coverCache.set(key, { url: cover, createdAt: Date.now() });
  return cover;
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
