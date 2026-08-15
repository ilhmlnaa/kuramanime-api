import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanServerName, parseEpisodeDynamicHtml } from '../src/services/scraper.js';

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
