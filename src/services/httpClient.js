import 'dotenv/config';

/**
 * HTTP client dengan proxy support untuk scraping.
 * Menggunakan fetch bawaan Node 22 (global).
 */
const BASE_URL = process.env.KUMA_BASE_URL || 'https://v19.kuramanime.ing';
const PROXY = process.env.KUMA_PROXY || '';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Buat opsi fetch dengan proxy + headers dasar.
 */
function buildFetchOptions(method = 'GET', headers = {}, body = null) {
  const options = {
    method,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': '*/*',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': `${BASE_URL}/`,
      ...headers,
    },
    redirect: 'follow',
  };

  if (body) options.body = body;
  return options;
}

/**
 * Fetch dengan proxy.
 * Proxy diekspektasikan sebagai HTTP proxy string, contoh: "http://172.20.20.102:8888"
 */
async function fetchWithProxy(url, options) {
  if (!PROXY) return fetch(url, options);

  // Gunakan undici ProxyAgent kalau tersedia (Node >= 20 via undici).
  try {
    const { ProxyAgent } = await import('undici');
    const dispatcher = new ProxyAgent(PROXY);
    return fetch(url, { ...options, dispatcher });
  } catch {
    // Fallback: fetch biasa (proxy diabaikan)
    console.warn('[http] ProxyAgent tidak tersedia, fallback ke fetch langsung');
    return fetch(url, options);
  }
}

/**
 * GET request → text
 */
export async function getText(url, headers = {}) {
  const res = await fetchWithProxy(url, buildFetchOptions('GET', headers));
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

/**
 * POST request → text (form-urlencoded body)
 */
export async function postForm(url, formBody, headers = {}) {
  const options = buildFetchOptions('POST', {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    ...headers,
  }, formBody);
  const res = await fetchWithProxy(url, options);
  if (!res.ok) throw new Error(`POST ${url} → HTTP ${res.status}`);
  return res.text();
}

export { BASE_URL };
