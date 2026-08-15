import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCover,
  enrichWithCovers,
  resolveCover,
} from '../src/services/imageResolver.js';

test('extractCover reads data-setbg before og:image', () => {
  const html = `
    <meta property="og:image" content="https://example.com/og.jpg">
    <div class="anime__details__pic" data-setbg="https://example.com/cover.jpg"></div>`;

  assert.equal(extractCover(html), 'https://example.com/cover.jpg');
});

test('extractCover falls back to og:image', () => {
  const html = '<meta property="og:image" content="https://example.com/og.jpg">';

  assert.equal(extractCover(html), 'https://example.com/og.jpg');
});

test('enrichWithCovers adds images with bounded concurrency', async () => {
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
      return `https://example.com/${item.id}.jpg`;
    },
  });

  assert.deepEqual(enriched.map((item) => item.img), [
    'https://example.com/1.jpg',
    'https://example.com/2.jpg',
    'https://example.com/3.jpg',
  ]);
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

  assert.deepEqual(results, Array(3).fill('https://example.com/dedupe.jpg'));
  assert.equal(calls, 1);
});
