import {
  scrapeHome,
  scrapeAnimeList,
  scrapeAnimeDetail,
  scrapeEpisode,
  scrapeSchedule,
  scrapeQuickList,
  scrapeProperties,
} from '../services/scraper.js';
import { getStreamSource, getBatchDownload } from '../services/streamAuth.js';

// ─── Home ─────────────────────────────────────
export async function homeController(req, res, next) {
  try {
    const data = await scrapeHome();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Anime List / Search ──────────────────────
export async function animeListController(req, res, next) {
  try {
    const { search, order_by, page, genre, season, type, quality, source, country, studio } = req.query;
    const data = await scrapeAnimeList({ search, order_by, page, genre, season, type, quality, source, country, studio });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function searchController(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" minimal 2 karakter' });
    }
    const data = await scrapeAnimeList({ search: q, order_by: 'text', page: 1 });
    res.json({ success: true, data: { query: q, results: data.results } });
  } catch (err) {
    next(err);
  }
}

// ─── Quick Lists: ongoing, finished, upcoming, movie, donghua ──
export async function quickListController(req, res, next) {
  try {
    const { type } = req.params;
    const valid = ['ongoing', 'finished', 'upcoming', 'movie', 'donghua'];
    if (!valid.includes(type)) {
      return res.status(400).json({ success: false, error: `Tipe tidak valid. Gunakan: ${valid.join(', ')}` });
    }
    const data = await scrapeQuickList(type);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Properties ──────────────────────────────
export async function propertiesController(req, res, next) {
  try {
    const { type } = req.params;
    const valid = ['genre', 'season', 'studio', 'type', 'quality', 'source', 'country'];
    if (!valid.includes(type)) {
      return res.status(400).json({ success: false, error: `Tipe properti tidak valid. Gunakan: ${valid.join(', ')}` });
    }
    const data = await scrapeProperties(type);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Anime Detail ────────────────────────────
export async function animeDetailController(req, res, next) {
  try {
    const { id, slug } = req.params;
    const param = slug ? `${id}/${slug}` : id;
    const data = await scrapeAnimeDetail(param);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Episode (metadata + download + server list) ──
export async function episodeController(req, res, next) {
  try {
    const { id, ep } = req.params;
    const data = await scrapeEpisode(id, parseInt(ep));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Stream URL ──────────────────────────────
/**
 * Mendapatkan URL streaming dari server tertentu.
 * Menggunakan Playwright (headless chromium) untuk mengeksekusi
 * leviathan.js → otomatis dapat authorization token + CSRF + page token.
 *
 * Query params:
 *   server (wajib) — kuramadrive | mega | streamruby | dsb (lihat response .servers)
 */
export async function streamController(req, res, next) {
  try {
    const { id, ep } = req.params;
    const { server } = req.query;

    if (!server) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "server" diperlukan. Contoh: ?server=kuramadrive',
      });
    }

    const result = await getStreamSource(id, ep, server);

    res.json({
      success: true,
      data: {
        animeId: id,
        episode: ep,
        server: result.server,
        videoUrl: result.videoUrl || null,
        iframeUrl: result.iframeUrl || null,
        servers: result.servers,
        hasError: result.hasError,
        note: result.hasError
          ? 'Streaming gagal dimuat. Kemungkinan token/leviathan kadaluarsa — coba lagi.'
          : undefined,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Batch ───────────────────────────────────
/**
 * Mendapatkan data unduhan batch (kualitas, size, link per server).
 * Menggunakan Playwright karena link dimuat dinamis via leviathan/jLoadSecure.
 *
 * Route: GET /anime/:id/batch/:range
 * Contoh: /anime/3791/batch/1-12
 */
export async function batchController(req, res, next) {
  try {
    const { id, range } = req.params;
    const data = await getBatchDownload(id, range);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Schedule ────────────────────────────────
export async function scheduleController(req, res, next) {
  try {
    const { day } = req.params;
    const data = await scrapeSchedule(day || 'wednesday');
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
