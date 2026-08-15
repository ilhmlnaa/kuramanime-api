const attempts = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 3;

function enabled(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

export function rateLimitCacheBypass(req, res, next) {
  const bypass = enabled(req.query?.noCache)
    || enabled(req.query?.refreshCache)
    || /no-cache/.test(req.get('Cache-Control') || '');

  if (!bypass) return next();

  const now = Date.now();
  const key = req.ip;
  const recent = (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak request bypass cache. Coba lagi dalam satu menit.',
    });
  }

  recent.push(now);
  attempts.set(key, recent);
  return next();
}