# Kuramanime API

Unofficial REST API untuk [Kuramanime](https://v19.kuramanime.ing/) — scraping anime subtitle Indonesia.

**Stack:** Node.js + Express + Cheerio + Playwright + Redis opsional

---

## Setup

```bash
git clone <repo-url> kuramanime-api
cd kuramanime-api
npm install

# (Wajib untuk endpoint stream)
npx playwright install --with-deps chromium
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `KUMA_PROXY` | (kosong) | Proxy HTTP (contoh: `http://172.20.20.102:8888`) — wajib kalau kena Cloudflare 403 |
| `KUMA_BASE_URL` | `https://v19.kuramanime.ing` | Base URL Kuramanime |
| `REDIS_URL` | (kosong) | Redis connection URL. Jika kosong, API berjalan tanpa response cache |

## Run

```bash
KUMA_PROXY="http://proxy-kamu:8888" npm start
```

> **Catatan:** Kalau deploy di server/VPS, pastikan `npm start` dijalankan dengan environment `KUMA_PROXY` yang benar.

---

## Endpoints

Dokumentasi interaktif tersedia di `GET /docs` dan spesifikasi OpenAPI mentah di `GET /openapi.json`.

### Response Cache

Cache Redis aktif otomatis jika `REDIS_URL` tersedia. API tetap berjalan normal ketika Redis tidak dikonfigurasi atau sedang bermasalah.

| Endpoint | TTL |
|---|---:|
| Home dan schedule | 2 menit |
| Anime list, search, quick lists | 5 menit |
| Detail anime | 10 menit |
| Episode | 2 menit |
| Stream URL | 1 menit |
| Batch download | 10 menit |
| Properties | 6 jam |

Cover anime memiliki cache terpisah: 6 jam di memory process dan 7 hari di Redis. Request cover untuk anime yang sama juga dideduplikasi agar request bersamaan tidak melakukan fetch detail berulang.

Kontrol cache per request:

- `?noCache=true`: ambil langsung dari upstream tanpa membaca atau menulis cache.
- `?refreshCache=true`: hapus cache lama, ambil data terbaru, lalu simpan ulang.
- Header `Cache-Control: no-cache`: sama seperti `noCache=true`.
- Header response `X-Cache`: `HIT`, `MISS`, `BYPASS`, atau `REFRESH`.

Contoh:

```text
GET /api/home?noCache=true
GET /api/anime/3791?refreshCache=true
```

### Root
```
GET /
→ { name, version, endpoints, note }
```

### Home / Beranda
```
GET /api/home
→ { success, data: { recent: [...], carousel: [...] } }
```

### Anime List (filter + search + pagination)
```
GET /api/anime?search=one+piece&order_by=text&page=1&genre=action
→ { success, data: { results: [...], pagination: {...} } }
```
Parameter query opsional: `search`, `order_by`, `page`, `genre`, `season`, `type`, `quality`, `source`, `country`, `studio`.

### Search (shortcut)
```
GET /api/search?q=one+piece
→ { success, data: { query, results: [...] } }
```

### Anime Detail
```
GET /api/anime/:id                    → /api/anime/50
GET /api/anime/:id/:slug              → /api/anime/50/one-piece-OreGjicNb0Fh
→ { success, data: { title, synopsis, genre, episodes: [...], ... } }
```

### Hybrid Episode Pagination

Kuramanime membatasi 13 episode per halaman. Untuk mengurangi jumlah request saat client membaca anime panjang, API menggunakan metode **hybrid pagination**:

1. Setiap request detail akan otomatis mengambil dan menggabungkan **2 halaman episode sekaligus** (sekitar 26 episode).
2. Jika total episode melebihi 2 halaman, property `episodePagination.hasNext` akan bernilai `true` dan client dapat mengambil kelanjutannya menggunakan parameter `?ep_page=3`.

Contoh request lanjutan:

```text
GET /api/anime/50/one-piece?ep_page=3
```

### Episode Metadata
```
GET /api/anime/:id/episode/:ep        → /api/anime/50/episode/989
→ { success, data: { title, animeTitle, servers: [...], downloads: [...], navigation: {prev, next} } }
```
- `servers` — daftar server streaming (id + label)
- `downloads` — daftar link download (kualitas + URL)
- `slug` — slug anime yang konsisten dengan endpoint detail anime
- `navigation.prev` dan `navigation.next` — episode sebelum/sesudahnya dengan `id`, `episode`, dan `url`
- `episodes` — seluruh daftar episode; setiap item berisi `id`, `episode`, `title`, `url`, dan `isCurrent`

### Stream URL ⚡
```
GET /api/anime/:id/episode/:ep/stream?server=kuramadrive
→ { success, data: { videoUrl, iframeUrl, servers, hasError } }
```

**Ini endpoint paling kompleks** — pakai Playwright (Chromium headless) untuk mengeksekusi `leviathan.js` milik Kuramanime secara otomatis.

Parameter:
- `server` (wajib) — ID server dari response episode (`kuramadrive`, `mega`, dll)

Response:
- `videoUrl` — URL MP4 langsung (kuramadrive)
- `iframeUrl` — URL iframe (server lain)
- `servers` — daftar server yang tersedia
- `hasError` — `true` jika streaming gagal (token kadaluarsa, coba lagi)

> **First request lambat** (~5-8 detik) karena launch browser + load leviathan.js. Request berikutnya untuk episode yang sama dalam 5 menit akan cepat (<1 detik, cache).

### Batch Download 📦
```bash
GET /api/anime/:id/batch/:range          → /api/anime/3791/batch/1-12
GET /api/anime/:id/:slug/batch/:range    → /api/anime/3791/watashi-ga-koibito.../batch/1-12
→ { success, data: { title, range, downloads: [...] } }
```
`downloads` berisi daftar kualitas dengan size + link per server:
```json
{
  "quality": "MKV 480p (Softsub)",
  "type": "mkv",
  "subType": "softsub",
  "size": "1.39 GB",
  "links": [
    { "server": "kDrive", "url": "https://v1.kuramadrive.com/..." },
    { "server": "MediaFire", "url": "https://www.mediafire.com/..." }
  ]
}
```
Sama seperti `/stream`, ini butuh Playwright (link dimuat dinamis via `jLoadSecure`). Slug-only pun aman — ID di-resolve otomatis.

### Quick Lists
```text
GET /api/quick/:type?page=1&limit=20&includeImages=true
```

Nilai `type`: `ongoing`, `finished`, `upcoming`, `movie`, atau `donghua`.

| Parameter | Default | Batas | Keterangan |
|---|---:|---:|---|
| `page` | `1` | minimum `1` | Halaman hasil |
| `limit` | `20` | maksimum `50` | Jumlah anime per halaman |
| `includeImages` | `true` | boolean | Isi properti `img`; gunakan `false` untuk response lebih cepat |

Contoh:

```text
GET /api/quick/ongoing?page=1&limit=20
GET /api/quick/movie?page=2&limit=10&includeImages=false
```

Response:

```json
{
  "success": true,
  "data": {
    "type": "ongoing",
    "includeImages": true,
    "results": [
      {
        "id": "5067",
        "slug": "kimi-wo-aisuru-ki-wa-nai...",
        "title": "Kimi wo Aisuru Ki wa Nai...",
        "episode": 6,
        "totalEpisodes": 12,
        "img": "https://.../cover.jpg",
        "url": "https://v19.kuramanime.ing/anime/5067/..."
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 100,
      "limit": 20,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

Quick list asli tidak menyediakan gambar. API mengambil cover hanya untuk item pada halaman yang diminta. Dengan default `limit=20`, cold request membutuhkan maksimal 20 fetch cover, bukan 100. Setelah cover tersimpan di Redis, instance API lain dapat menggunakan cache yang sama selama 7 hari.

### Properties
```
GET /api/properties/genre
GET /api/properties/season
GET /api/properties/studio
GET /api/properties/type
GET /api/properties/quality
GET /api/properties/source
GET /api/properties/country
→ { success, data: { type, items: [...] } }
```

### Schedule / Jadwal
```
GET /api/schedule/senin
GET /api/schedule/selasa
...
GET /api/schedule/minggu
→ { success, data: { day, schedule: [...] } }
```

Setiap item jadwal berisi `id`, `slug`, `title`, `episode`, `airDay`, `airTime`, `img`, dan `url`.

---

## Arsitektur

```
src/
├── app.js              Express setup (CORS, JSON, routes)
├── server.js           Entry point
├── controllers/
│   └── kuramanimeController.js   Semua controller
├── routes/
│   └── index.js        Definisi route
└── services/
    ├── httpClient.js   HTTP client (fetch + proxy + retry)
    ├── scraper.js      Scraping pure fetch + Cheerio
    └── streamAuth.js   Playwright stream service (auto-token)
```

**Dua jalur scraping:**
1. **Fetch + Cheerio** — 90% endpoint (home, search, detail, episode metadata, schedule, dll). Cepat, ringan, nggak perlu browser.
2. **Playwright** — khusus endpoint `/stream` karena butuh eksekusi `leviathan.js` (token authorization session-bound, nggak bisa di-reverse murni fetch).

---

## Cara Kerja Stream Auth

Kode di `src/services/streamAuth.js` melakukan:

1. Launch Chromium headless (sekali, persist)
2. Navigasi ke halaman episode → tunggu `window.getStTk` siap
3. `getStTk()` → fetch file `.txt` random → **page token** (10-char)
4. `fetch check-episode` → page number
5. `jLoadSecure()` — POST ke endpoint episode dengan authorization token otomatis
6. Parse HTML response → extract `<video><source>` (kuramadrive) atau `<iframe>` (server lain)

Browser instance di-cache (TTL navigasi 5 menit), jadi request berikutnya untuk episode yang sama hampir instan.

---

## Error Handling

| HTTP Status | Arti |
|---|---|
| 200 | OK |
| 400 | Parameter tidak valid (contoh: `server` kosong di stream, `q` < 2 karakter di search) |
| 500 | Server error / gagal scrape (proxy down, Cloudflare block, token expired) |

Stream endpoint bisa return `success: true` + `hasError: true` — artinya request berhasil tapi server streaming internal Kuramanime error. Coba lagi dengan server lain atau tunggu.

---

## Requirements

- **Node.js** ≥ 18
- **Playwright Chromium** — `npx playwright install --with-deps chromium`
- Proxy HTTP (opsional tapi sangat disarankan — Kuramanime pakai Cloudflare)

## License

MIT — unofficial, not affiliated with Kuramanime.
