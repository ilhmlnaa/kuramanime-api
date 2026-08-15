import { chromium } from 'playwright';
import { parseEpisodeDynamicHtml } from './scraper.js';

/**
 * Kuramanime Stream Service (Playwright-backed)
 *
 * Menghasilkan URL streaming dengan mengeksekusi leviathan.js di browser headless.
 * Strategi: 1 instance Chromium + 1 page yang di-reuse (persistent), sehingga:
 * - TIDAK perlu launch browser tiap request (hemat waktu → CEPAT)
 * - Cookie/VSID & CSRF token PERSIST di context → token tetap valid
 * - Hanya navigate ulang ke episode saat token kadaluarsa
 *
 * Alur per request:
 * 1. (jika page kosong) navigasi ke halaman episode → leviathan.js load
 * 2. getStTk() → page token (query param Ub3BzhijicHXZdv)
 * 3. fetch check-episode → page number
 * 4. jLoadSecure() POST → dapat HTML yang berisi <video><source src>
 * 5. parse & return stream URL
 */

const BASE_URL = 'https://v19.kuramanime.ing';
const PROXY = process.env.KUMA_PROXY || '';

// Cache untuk hindari re-navigate tiap request
let browser = null;
let context = null;
let page = null;
let lastEpisode = null;   // { id, num } yang sedang di-load
let lastLoadedAt = 0;
const NAV_TTL_MS = 5 * 60 * 1000;
let pageQueue = Promise.resolve();

function withPageLock(task) {
  const result = pageQueue.then(task, task);
  pageQueue = result.catch(() => {});
  return result;
}

/** Ambil browser instance (launch sekali, reuse terus) */
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
    proxy: PROXY ? { server: PROXY } : undefined,
  });
  context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'id-ID',
    viewport: { width: 1280, height: 720 },
  });
  page = await context.newPage();
  return browser;
}

/** Navigasi ke halaman episode dan tunggu leviathan.js siap (getStTk ada) */
async function ensureLoaded(animeId, episodeNum) {
  await getBrowser();
  const now = Date.now();
  const sameEpisode = lastEpisode && lastEpisode.id === animeId && lastEpisode.num === episodeNum;
  const fresh = now - lastLoadedAt < NAV_TTL_MS;

  if (sameEpisode && fresh && typeof (await evaluateSafe('typeof window.getStTk')) !== 'undefined') {
    return; // sudah di halaman yang benar & token masih valid
  }

  const url = `${BASE_URL}/anime/${animeId}/episode/${episodeNum}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Tunggu leviathan.js load (window.getStTk tersedia)
  await page.waitForFunction('typeof window.getStTk === "function"', { timeout: 30000 });

  lastEpisode = { id: animeId, num: episodeNum };
  lastLoadedAt = now;
}

/** Bungkus page.evaluate anti-error saat page belum siap */
async function evaluateSafe(expr) {
  try {
    return await page.evaluate(expr);
  } catch {
    return undefined;
  }
}

/**
 * Dapatkan URL streaming untuk episode tertentu.
 *
 * @param {string|number} animeId
 * @param {string|number} episodeNum
 * @param {string} server - server id (kuramadrive|mega|...)
 * @returns {Promise<object>} { videoUrl, iframeUrl, source, hasError, servers }
 */
async function getStreamSourceUnlocked(animeId, episodeNum, server) {
  await ensureLoaded(animeId, episodeNum);

  const result = await page.evaluate(
    async ({ BASE_URL, server }) => {
      const out = {};
      const episodeUrl = location.href;

      // CSRF token
      out.csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

      // Daftar server
      out.servers = [];
      document.querySelectorAll('#changeServer option').forEach((opt) => {
        const val = opt.value;
        if (val) out.servers.push({ id: val, label: opt.textContent.trim() });
      });

      // Page token dari getStTk
      const pageToken = await new Promise((resolve, reject) => {
        window.getStTk(resolve, reject);
      });
      out.pageToken = pageToken;

      // Page number dari check-episode
      try {
        const id = (document.querySelector('#animeId')?.value) || episodeUrl.match(/\/anime\/(\d+)/)?.[1] || '';
        const ep = episodeUrl.match(/\/episode\/(\d+)/)?.[1] || '';
        const checkResp = await fetch(`${BASE_URL}/anime/${id}/episode/${ep}/check-episode`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        out.checkPage = (await checkResp.text()).replace(/["'\s]/g, '') || '1';
      } catch {
        out.checkPage = '1';
      }

      // Trigger jLoadSecure → POST → HTML streaming
      const streamHtml = await new Promise((resolve) => {
        const url = `${episodeUrl}?Ub3BzhijicHXZdv=${encodeURIComponent(pageToken)}&C2XAPerzX1BM7V9=${encodeURIComponent(server)}&page=${out.checkPage}`;
        window.jLoadSecure('.anime_vid_player', url, {}, (data) => resolve(data));
      });

      // Parse HTML untuk source video
      const parser = new DOMParser();
      const doc = parser.parseFromString(streamHtml, 'text/html');
      const player = doc.querySelector('#player');
      const source = player
        ? player.querySelector('source')?.src || player.getAttribute('data-hls-src') || player.getAttribute('src') || ''
        : '';
      const iframe = doc.querySelector('iframe');

      out.videoUrl = source || '';
      out.iframeUrl = iframe ? iframe.src : '';
      // Error HANYA jika tidak ada source video DAN tidak ada iframe embed.
      // Jangan pakai text-based check ("Terjadi kesalahan") karena teks itu
      // bisa muncul di bagian lain halaman (footer/komentar) padahal stream valid.
      out.hasError = !source && !(iframe && iframe.src);
      return out;
    },
    { BASE_URL, server }
  );

  return {
    server,
    videoUrl: result.videoUrl,
    iframeUrl: result.iframeUrl,
    hasError: !!result.hasError,
    servers: result.servers || [],
    page: result.checkPage || '1',
    csrfToken: result.csrfToken,
  };
}

export function getStreamSource(animeId, episodeNum, server) {
  return withPageLock(() => getStreamSourceUnlocked(animeId, episodeNum, server));
}

export function getEpisodeDynamicData(animeId, episodeNum) {
  return withPageLock(async () => {
    const stream = await getStreamSourceUnlocked(animeId, episodeNum, 'kuramadrive');

    await page.waitForFunction(
      () => document.querySelectorAll('#animeDownloadLink h6').length > 0,
      { timeout: 30000 }
    );

    const parsed = parseEpisodeDynamicHtml(await page.content());

    return {
      downloads: parsed.downloads,
      streamUrl: stream.videoUrl || stream.iframeUrl || parsed.streamUrl || null,
    };
  });
}

/** Tutup browser (untuk shutdown bersih) */
export async function closeStreamBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
  }
}

// ─── Batch ──────────────────────────────────────────────

let lastBatch = null;   // { url, loadedAt } halaman batch yang sedang di-load

/**
 * Ambil data unduhan batch (kualitas + size + link per server).
 *
 * Link download batch di-load secara dinamis via leviathan/jLoadSecure,
 * jadi tidak bisa pure fetch — harus pakai Playwright:
 * 1. Navigasi ke halaman batch (mis. /anime/3791/slug/batch/1-12)
 * 2. Tunggu #animeDownloadLink terisi (JS sudah mengeksekusi token)
 * 3. Parse h6 (kualitas + size) dan link server di bawahnya
 *
 * @param {string|number} animeIdOrSlug - ID atau slug anime
 * @param {string} range - rentang episode batch, mis. "1-12"
 * @returns {Promise<object>} { title, range, downloads }
 */
async function getBatchDownloadUnlocked(animeIdOrSlug, range) {
  await getBrowser();

  // Batch URL WAJIB pakai ID numerik — slug-only redirect ke /xxx/ yang rusak.
  // Kalau yang dikirim slug, resolve dulu lewat halaman detail (input#animeId).
  let animeId = animeIdOrSlug;
  if (!/^\d+$/.test(String(animeIdOrSlug))) {
    await page.goto(`${BASE_URL}/anime/${animeIdOrSlug}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    animeId = await page.evaluate(() => document.querySelector('input#animeId')?.value || '');
    if (!animeId) {
      throw new Error(`Tidak dapat resolve anime ID dari slug: ${animeIdOrSlug}`);
    }
  }

  const url = `${BASE_URL}/anime/${animeId}/batch/${range}`;

  // Navigasi ulang jika beda URL atau cache > 5 menit
  const now = Date.now();
  if (!(lastBatch && lastBatch.url === url && now - lastBatch.loadedAt < NAV_TTL_MS)) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Tunggu download links muncul (diisi via JS/leviathan)
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#animeDownloadLink');
        return el && el.querySelectorAll('h6').length > 0;
      },
      { timeout: 30000 }
    );
    lastBatch = { url, loadedAt: now };
  }

  const result = await page.evaluate(() => {
    const out = {};
    out.title =
      document.querySelector('h1, .anime__details__title h3')?.textContent?.trim() || '';
    out.range =
      document.querySelector('.section-title-v2 span.text-danger')?.textContent?.trim() || '';

    const downloads = [];
    const container = document.querySelector('#animeDownloadLink');
    if (container) {
      // Struktur: <h6>Kualitas (Size)</h6> <hr> <a>Server</a> <a>Server</a> ...
      container.querySelectorAll('h6').forEach((h6) => {
        const heading = h6.textContent.trim().replace(/\s+/g, ' ');
        // Parse: "MKV 480p (Softsub) — (1.39 GB)"
        const qualityMatch = heading.match(/^(.*?)\s*[—-]?\s*\(([\d.,]+\s*(?:GB|MB|KB))\)/i);
        const quality = qualityMatch ? qualityMatch[1].trim() : heading;
        const size = qualityMatch ? qualityMatch[2] : null;
        const type = /mkv/i.test(heading) ? 'mkv' : /mp4/i.test(heading) ? 'mp4' : 'other';
        const subType = /softsub/i.test(heading) ? 'softsub' : /hardsub/i.test(heading) ? 'hardsub' : null;

        const links = [];
        let sibling = h6.nextElementSibling;
        while (sibling && sibling.tagName !== 'H6') {
          if (sibling.tagName === 'A' && sibling.getAttribute('href')) {
            links.push({
              server: sibling.textContent.trim(),
              url: sibling.getAttribute('href'),
            });
          }
          sibling = sibling.nextElementSibling;
        }
        downloads.push({
          quality,
          type,
          subType,
          size,
          links,
        });
      });
    }
    out.downloads = downloads;
    return out;
  });

  return {
    title: result.title,
    range: result.range || range,
    downloads: result.downloads || [],
    url,
  };
}

export function getBatchDownload(animeIdOrSlug, range) {
  return withPageLock(() => getBatchDownloadUnlocked(animeIdOrSlug, range));
}