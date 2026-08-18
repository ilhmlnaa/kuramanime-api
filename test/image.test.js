import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCover,
  enrichWithCovers,
  resolveCover,
} from '../src/services/imageResolver.js';

test('extractCover reads data-setbg before og:image and extracts rating', () => {
  const html = `
    <meta property="og:image" content="https://example.com/og.jpg">
    <div class="anime__details__pic" data-setbg="https://example.com/cover.jpg"></div>
    <div class="anime__details__rating"><span>8.67</span></div>`;

  assert.deepEqual(extractCover(html), { cover: 'https://example.com/cover.jpg', rating: '8.67' });
});

test('extractCover falls back to og:image and handles missing rating', () => {
  const html = '<meta property="og:image" content="https://example.com/og.jpg">';

  assert.deepEqual(extractCover(html), { cover: 'https://example.com/og.jpg', rating: null });
});

test('enrichWithCovers adds images and ratings with bounded concurrency', async () => {
  const items = [
    { id: '1', url: '/anime/1/first' },
    { id: '2', url: '/anime/2/second' },
    { id: '3', url: '/anime/3/third' },
  ];
  let active = 0;
  let maxActive = 0;

  const enriched = await enrichWithCovers(items, {
    concurrency: 2,
    resolve: async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { cover: `https://example.com/${item.id}.jpg`, rating: `8.${item.id}` };
    },
  });

  assert.deepEqual(enriched.map((item) => item.img), [
    'https://example.com/1.jpg',
    'https://example.com/2.jpg',
    'https://example.com/3.jpg',
  ]);
  assert.deepEqual(enriched.map((item) => item.rating), ['8.1', '8.2', '8.3']);
  assert.equal(maxActive, 2);
});

test('enrichWithCovers preserves items when cover resolution fails', async () => {
  const items = [{ id: '1', url: '/anime/1/first' }];
  const enriched = await enrichWithCovers(items, {
    resolve: async () => { throw new Error('upstream unavailable'); },
  });

  assert.equal(enriched[0].img, '');
});

test('resolveCover deduplicates concurrent detail requests', async () => {
  let calls = 0;
  const item = { id: 'dedupe-test', url: '/anime/dedupe-test' };
  const fetchText = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return '<meta property="og:image" content="https://example.com/dedupe.jpg">';
  };

  const results = await Promise.all([
    resolveCover(item, { fetchText }),
    resolveCover(item, { fetchText }),
    resolveCover(item, { fetchText }),
  ]);

  assert.deepEqual(results, Array(3).fill({ cover: 'https://example.com/dedupe.jpg', rating: null }));
  assert.equal(calls, 1);
});
