import { chromium } from 'playwright';

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
const NAV_TTL_MS = 5 * 60 * 1000; // 5 menit valid, lalu re-navigate

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
export async function getStreamSource(animeId, episodeNum, server) {
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
      out.hasError = streamHtml.includes('Terjadi kesalahan') || (player && !source);
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

/** Tutup browser (untuk shutdown bersih) */
export async function closeStreamBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
  }
}