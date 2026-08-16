import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEpisodeNavigation,
  cleanServerName,
  extractAnimeSlug,
  extractEpisodeLinks,
  parseEpisodeDynamicHtml,
} from '../src/services/scraper.js';

test('cleanServerName removes parenthetical descriptions', () => {
  assert.equal(cleanServerName('Kuramadrive s1 (normal, iklan banner)'), 'Kuramadrive s1');
  assert.equal(cleanServerName('FileMoon (kencang, iklan popup)'), 'FileMoon');
  assert.equal(cleanServerName('MEGA'), 'MEGA');
});

test('parseEpisodeDynamicHtml extracts downloads grouped by quality', () => {
  const html = `
    <div id="animeDownloadLink">
      <h6>MKV 480p (Softsub) — (166.76 MB)</h6>
      <hr>
      <a href="https://pixeldrain.com/d/example">Extra 1</a>
      <a href="https://v1.kuramadrive.com/kdrive/example">kDrive</a>
      <br>
      <h6>MP4 720p (Hardsub) — (187.85 MB)</h6>
      <hr>
      <a href="https://mega.co.nz/example">MEGA</a>
    </div>`;

  assert.deepEqual(parseEpisodeDynamicHtml(html).downloads, [
    {
      quality: 'MKV 480p (Softsub)',
      size: '166.76 MB',
      links: [
        { name: 'Extra 1', url: 'https://pixeldrain.com/d/example' },
        { name: 'kDrive', url: 'https://v1.kuramadrive.com/kdrive/example' },
      ],
    },
    {
      quality: 'MP4 720p (Hardsub)',
      size: '187.85 MB',
      links: [{ name: 'MEGA', url: 'https://mega.co.nz/example' }],
    },
  ]);
});

test('parseEpisodeDynamicHtml returns the active Kuramadrive video URL', () => {
  const html = `
    <div class="anime_vid_player">
      <video id="player" src="https://chisato.my.id/kdrive/video.mp4?token=abc">
        <source src="https://chisato.my.id/kdrive/video.mp4?token=abc" type="video/mp4">
      </video>
    </div>`;

  assert.equal(
    parseEpisodeDynamicHtml(html).streamUrl,
    'https://chisato.my.id/kdrive/video.mp4?token=abc'
  );
});

test('buildEpisodeNavigation deduplicates episodes and resolves adjacent entries', () => {
  const links = [
    { episode: 3, url: 'https://example.com/episode/3' },
    { episode: 1, url: 'https://example.com/episode/1' },
    { episode: 3, url: 'https://example.com/episode/3' },
    { episode: 2, url: 'https://example.com/episode/2' },
  ];

  assert.deepEqual(buildEpisodeNavigation(links, 2), {
    episodes: [
      { id: 1, episode: 1, title: 'Episode 1', url: 'https://example.com/episode/1', isCurrent: false },
      { id: 2, episode: 2, title: 'Episode 2', url: 'https://example.com/episode/2', isCurrent: true },
      { id: 3, episode: 3, title: 'Episode 3', url: 'https://example.com/episode/3', isCurrent: false },
    ],
    navigation: {
      prev: { id: 1, episode: 1, url: 'https://example.com/episode/1' },
      next: { id: 3, episode: 3, url: 'https://example.com/episode/3' },
    },
  });
});

test('buildEpisodeNavigation returns null at episode boundaries', () => {
  const links = [
    { episode: 1, url: 'https://example.com/episode/1' },
    { episode: 2, url: 'https://example.com/episode/2' },
  ];

  assert.equal(buildEpisodeNavigation(links, 1).navigation.prev, null);
  assert.equal(buildEpisodeNavigation(links, 2).navigation.next, null);
});

test('extractEpisodeLinks reads episode URLs from detail popover', () => {
  const html = `<button id="episodeLists" data-content="
    <a href='https://example.com/anime/1/title/episode/1'>Ep 1</a>
    <a href='https://example.com/anime/1/title/episode/2'>Ep 2</a>
  "></button>`;

  assert.deepEqual(extractEpisodeLinks(html), [
    { episode: 1, url: 'https://example.com/anime/1/title/episode/1' },
    { episode: 2, url: 'https://example.com/anime/1/title/episode/2' },
  ]);
});

test('extractAnimeSlug reads slug from episode and detail URLs', () => {
  assert.equal(
    extractAnimeSlug('https://example.com/anime/3791/watashi-ga-koibito/episode/1'),
    'watashi-ga-koibito'
  );
  assert.equal(
    extractAnimeSlug('https://example.com/anime/3791/watashi-ga-koibito'),
    'watashi-ga-koibito'
  );
});
