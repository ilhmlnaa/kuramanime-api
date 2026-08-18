import * as cheerio from 'cheerio';
import { getText, BASE_URL } from './httpClient.js';
import { enrichWithCovers, extractCover } from './imageResolver.js';
import { paginateQuickList } from './quickList.js';

export function cleanServerName(name) {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function parseEpisodeDynamicHtml(html) {
  const $ = cheerio.load(html);
  const downloads = [];

  $('#animeDownloadLink h6').each((_, el) => {
    const heading = $(el).text().replace(/\s+/g, ' ').trim();
    const sizeMatch = heading.match(/\s*[—-]\s*\(([\d.,]+\s*(?:GB|MB|KB))\)\s*$/i);
    const quality = sizeMatch ? heading.slice(0, sizeMatch.index).trim() : heading;
    const links = [];

    $(el).nextUntil('h6').each((_, sibling) => {
      const anchors = $(sibling).is('a') ? $(sibling) : $(sibling).find('a');
      anchors.each((_, anchor) => {
        const href = $(anchor).attr('href');
        if (href) {
          links.push({
            name: $(anchor).text().replace(/\s+/g, ' ').trim(),
            url: href,
          });
        }
      });
    });

    if (quality && links.length) {
      downloads.push({
        quality,
        size: sizeMatch?.[1] || null,
        links,
      });
    }
  });

  const player = $('#player');
  const streamUrl = player.attr('src')
    || player.find('source').first().attr('src')
    || player.attr('data-hls-src')
    || null;

  return { downloads, streamUrl };
}

export function buildEpisodeNavigation(links, currentEpisode) {
  const unique = new Map();
  for (const link of links) {
    if (!unique.has(link.episode)) unique.set(link.episode, link.url);
  }

  const episodes = [...unique.entries()]
    .sort(([left], [right]) => left - right)
    .map(([episode, url]) => ({
      id: episode,
      episode,
      title: `Episode ${episode}`,
      url,
      isCurrent: episode === currentEpisode,
    }));
  const index = episodes.findIndex((item) => item.episode === currentEpisode);
  const toNavigation = (item) => item
    ? { id: item.id, episode: item.episode, url: item.url }
    : null;

  return {
    episodes,
    navigation: {
      prev: index > 0 ? toNavigation(episodes[index - 1]) : null,
      next: index >= 0 ? toNavigation(episodes[index + 1]) : null,
    },
  };
}

export function extractEpisodeLinks(html) {
  const $ = cheerio.load(html || '');
  const dataContent = $('#episodeLists').attr('data-content') || '';
  return [...dataContent.matchAll(/href='([^']*\/episode\/(\d+))'/g)].map((match) => ({
    episode: Number.parseInt(match[2], 10),
    url: match[1],
  }));
}

export function extractEpisodePagination(html) {
  const $ = cheerio.load(html || '');
  const dataContent = $('#episodeLists').attr('data-content') || '';
  const nextMatch = dataContent.match(/href=['"][^'"]*page=(\d+)['"][^>]*><i class=['"]fa fa-forward/);
  return nextMatch ? Number.parseInt(nextMatch[1], 10) : null;
}

export function extractAnimeSlug(url) {
  const match = String(url || '').match(/\/anime\/(?:\d+\/)?([^/?#]+)/);
  return match?.[1] || '';
}

/**
 * Kuramanime Scraper Service
 * Parsing HTML ke JSON untuk semua endpoint.
 */

// ─── Homepage ────────────────────────────────────────

export async function scrapeHome() {
  const html = await getText(`${BASE_URL}`);
  const $ = cheerio.load(html);

  const recent = [];
  $('.product__item').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('.product__item__pic').attr('href') || $el.find('a').attr('href') || '';
    const img = $el.find('.set-bg').attr('data-setbg') || $el.find('img').attr('src') || '';
    const title = $el.find('h5').text().trim();
    const episode = $el.find('.ep').text().trim();
    const quality = $el.find('.view').text().trim();
    recent.push({ title, episode, quality, img, url: $link, slug: extractSlug($link) });
  });

  // Carousel/banner — struktur: .hero__slider.owl-carousel > .hero__items
  // (data-setbg untuk gambar, h2 untuk judul, a[href*="/anime/"] untuk link anime)
  const carousel = [];
  $('.hero__slider .hero__items, .hero__slider .owl-item .hero__items').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a[href*="/anime/"]').attr('href') || '';
    const img = $el.attr('data-setbg') || $el.find('.set-bg, [data-setbg]').attr('data-setbg') || '';
    const title = $el.find('h2, h1, h3').first().text().trim();
    if (title) carousel.push({ title, img, url: link, slug: extractSlug(link) });
  });

  return { recent, carousel };
}

// ─── Daftar Anime / Search ─────────────────────────

export async function scrapeAnimeList(params = {}) {
  const { search = '', order_by = 'text', page = 1, genre, season, type, quality, source, country, studio } = params;

  // Build URL
  let url = `${BASE_URL}/anime?order_by=${order_by}&page=${page}`;
  if (search) url = `${BASE_URL}/anime?search=${encodeURIComponent(search)}&order_by=${order_by}&page=${page}`;
  if (genre) url += `&genre=${encodeURIComponent(genre)}`;
  if (season) url += `&season=${encodeURIComponent(season)}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;

  const html = await getText(url);
  const $ = cheerio.load(html);

  const results = [];
  // Halaman anime list/search pakai struktur .anime__list__link — flat anchor
  // tanpa gambar, episode, atau kualitas.
  $('.anime__list__link').each((_, el) => {
    const $el = $(el);
    const link = $el.attr('href') || '';
    const title = $el.text().trim();
    if (title && link) {
      results.push({
        title,
        url: link,
        id: extractId(link),
        slug: extractSlug(link),
      });
    }
  });

  // Fallback: jika selector di atas tidak ketemu, coba .product__item
  if (results.length === 0) {
    $('.product__item').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a[href*="/anime/"]').attr('href') || '';
      const img = $el.find('.set-bg').attr('data-setbg') || $el.find('img').attr('src') || '';
      const title = $el.find('h5').text().trim();
      const episode = $el.find('.ep').text().trim();
      const quality = $el.find('.view').text().trim();
      if (title) {
        results.push({
          title,
          episode,
          quality,
          img,
          url: link,
          id: extractId(link),
          slug: extractSlug(link),
        });
      }
    });
  }

  // Pagination
  const totalPages = $('.pagination .page-item').length || 1;
  const currentPage = parseInt($('.pagination .active').text().trim()) || page;

  return {
    results: await enrichWithCovers(results),
    pagination: { currentPage, totalPages: Math.max(totalPages, 1) },
    filters: { search, order_by, genre, season, type },
  };
}

// ─── Properti (genre, season, studio, etc.) ───────────

export async function scrapeProperties(type) {
  // Validate type
  const validTypes = ['genre', 'season', 'studio', 'type', 'quality', 'source'];
  if (!type || !validTypes.includes(type.toLowerCase())) {
    throw new Error(`Tipe properti tidak valid. Gunakan: ${validTypes.join(', ')}`);
  }

  const url = `${BASE_URL}/properties/${type}`;
  const html = await getText(url);
  const $ = cheerio.load(html);

  const items = [];
  // Properties page uses grid links: list > listitem > a
  const propSelector = `a[href*="/properties/${type}/"]`;
  $(propSelector).each((_, el) => {
    const $el = $(el);
    const name = $el.text().trim();
    const href = $el.attr('href') || '';
    const slugMatch = href.match(new RegExp(`/properties/${type}/([^?]+)`));
    const slug = slugMatch ? slugMatch[1] : name.toLowerCase().replace(/\\s+/g, '-');
    if (name && name.length > 0 && name.length < 60) {
      items.push({ name, slug, url: href });
    }
  });

  return { type, items };
}

// ─── Detail Anime ───────────────────────────────────

export async function scrapeAnimeDetail(param) {
  // param can be: "50" (id saja), "50/slug" (id+slug), atau "slug-only"
  // Parse: jika ada "/", split jadi id + slug
  let animeId, slug, url;
  if (param.includes('/')) {
    [animeId, slug] = param.split('/');
  } else if (/^\d+$/.test(param)) {
    animeId = param;
    slug = null;
  } else {
    animeId = null;
    slug = param;
  }

  if (slug) {
    url = `${BASE_URL}/anime/${animeId ? animeId + '/' : ''}${slug}?page=${epPage}`;
  } else if (animeId) {
    const searchHtml = await getText(`${BASE_URL}/anime?search=${animeId}&order_by=text&page=1`);
    const $s = cheerio.load(searchHtml);
    let match = $s(`.anime__list__link[href*="/anime/${animeId}/"]`).first().attr('href');
    if (!match) {
      match = $s(`.anime__list__link`).first().attr('href');
      if (!match) throw new Error(`Anime dengan ID ${animeId} tidak dapat diresolve slug-nya.`);
    }
    url = `${BASE_URL}${match}?page=${epPage}`;
  } else {
    throw new Error(`Parameter tidak valid: ${param}`);
  }

  const html = await getText(url);
  const $ = cheerio.load(html);

  const episodes = extractEpisodeLinks(html);
  let nextEpPage = extractEpisodePagination(html);

  if (nextEpPage === epPage + 1) {
    try {
      const nextUrl = url.replace(/\?page=\d+/, '') + `?page=${nextEpPage}`;
      const nextHtml = await getText(nextUrl);
      episodes.push(...extractEpisodeLinks(nextHtml));
      nextEpPage = extractEpisodePagination(nextHtml);
    } catch {}
  }

  // Basic info
  const title = $('.anime__details__title h3').text().trim();
  const japaneseTitle = $('.anime__details__title span').first().text().trim();
  const rating = $('.anime__details__rating span, .fa-star').parent().text().trim().match(/[\d.]+/)?.[0] || null;

  // Info list
  const info = {};
  $('.anime__details__widget ul li').each((_, el) => {
    const text = $(el).text().trim();
    const parts = text.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
      const value = parts.slice(1).join(':').trim();
      info[key] = value;
    }
  });

  // Sinopsis
  const synopsis = $('.anime__details__text p').first().text().trim()
    || $('[class*="synopsis"]').text().trim()
    || $('.anime__details__text').first().text().trim();

  // Genre list
  const genres = [];
  $('.anime__details__widget ul li a[href*="genre"]').each((_, el) => {
    genres.push({ name: $(el).text().trim(), url: $(el).attr('href') || '' });
  });

  // Cover image
  const cover = $('.anime__details__pic').attr('data-setbg')
    || $('.anime__details__pic img').attr('src')
    || $('meta[property="og:image"]').attr('content')
    || '';

  // Status
  const status = $('.anime__details__widget ul li:contains("Status")').text().split(':')[1]?.trim() || '';

  // Batch info — dari #episodeBatchLists popover (kalau anime punya batch)
  // data-content berisi: <a ... href='.../batch/1-12' ...> Ep 1-12 </a>
  const batch = { available: false, ranges: [] };
  const batchLists = $('#episodeBatchLists');
  if (batchLists.length) {
    const batchContent = batchLists.attr('data-content') || '';
    const batchMatches = [...batchContent.matchAll(/href='([^']*\/batch\/(\d+-\d+))'[^>]*>\s*([^<]+)/g)];
    for (const m of batchMatches) {
      batch.ranges.push({
        range: m[2],
        label: m[3].trim(),
        url: m[1],
      });
    }
    batch.available = batch.ranges.length > 0;
  }

  // Slug bersih (tanpa ID) — dari URL halaman detail
  const slugMatch = url.match(/\/anime\/(?:\d+\/)?([^/?#]+)$/);
  const detailSlug = slugMatch ? slugMatch[1] : '';

  return {
    id: extractId(url) || $('input#animeId').val() || null,
    slug: detailSlug,
    title,
    japaneseTitle,
    rating,
    status,
    cover,
    synopsis,
    genres,
    info,
    episodes,
    episodePagination: {
      hasNext: nextEpPage !== null,
      nextPage: nextEpPage,
    },
    batch,
    url,
  };
}

// ─── Episode / Streaming ───────────────────────────

/**
 * Dapatkan data episode termasuk daftar server streaming dan download links.
 * Untuk mendapatkan URL streaming langsung, diperlukan authorization token dari leviathan.js.
 * Tanpa token, endpoint akan mengembalikan halaman tanpa video tag.
 */
export async function scrapeEpisode(animeIdOrSlug, episodeNum) {
  // Build URL
  const url = `${BASE_URL}/anime/${animeIdOrSlug}`;

  // Get anime page first to find full URL
  let animeHtml, episodeUrl, animeId;
  try {
    animeHtml = await getText(url);
    const $a = cheerio.load(animeHtml);
    animeId = $a('input#animeId').val() || extractId(url);
    // Find episode link
    const epLink = $a(`a.ep-button:contains("Ep ${episodeNum}"), a[href*="episode/${episodeNum}"]`).first().attr('href');
    if (epLink) {
      episodeUrl = epLink.startsWith('http') ? epLink : `${BASE_URL}${epLink}`;
    } else {
      // Try constructing
      const slug = extractSlug(url);
      episodeUrl = `${BASE_URL}/anime/${animeId}/${slug}/episode/${episodeNum}`;
    }
  } catch {
    // If detail page fails, try constructing URL
    const slug = extractSlug(animeIdOrSlug);
    episodeUrl = `${BASE_URL}/anime/${animeIdOrSlug}/${slug}/episode/${episodeNum}`;
  }

  // Fetch episode page
  const html = await getText(episodeUrl);
  const $ = cheerio.load(html);

  // CSRF token
  const csrfToken = $('meta[name="csrf-token"]').attr('content') || '';

  // Episode title
  const episodeTitle = $('#episodeTitle').text().trim();

  // Server list
  const servers = [];
  $('#changeServer option').each((_, el) => {
    servers.push({
      id: $(el).attr('value') || '',
      name: cleanServerName($(el).text().trim()),
    });
  });

  // Check episode validity
  let checkValue = '';
  try {
    const checkUrl = `${BASE_URL}/anime/${animeId}/episode/${episodeNum}/check-episode`;
    const checkHeaders = {
      'x-csrf-token': csrfToken,
      'x-requested-with': 'XMLHttpRequest',
      'Origin': BASE_URL,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    };
    checkValue = await getText(checkUrl, checkHeaders);
    checkValue = checkValue.replace(/['"]/g, '').trim();
  } catch {
    checkValue = '';
  }

  // Download links
  const downloads = [];
  $('#animeDownloadLink h6').each((_, el) => {
    const heading = $(el).text().trim();
    const links = [];
    let $current = $(el).nextUntil('h6');
    $current.each((_, linkEl) => {
      if ($(linkEl).is('hr, br')) return;
      const $a = $(linkEl).is('a') ? $(linkEl) : $(linkEl).find('a');
      if ($a.length) {
        links.push({
          name: $a.text().trim(),
          url: $a.attr('href') || '',
        });
      }
    });
    if (heading && links.length) downloads.push({ quality: heading, links });
  });

  // Episode navigation
  const episodeGuide = buildEpisodeNavigation(extractEpisodeLinks(animeHtml), episodeNum);

  // Credit team
  const credit = $('#episodeCredit').text().trim();

  // Breadcrumb / anime title
  const animeTitle = $('.breadcrumb__links a[href*="/anime/"]').last().prev().text().trim()
    || $('.breadcrumb__links a').eq(2).text().trim();

  return {
    animeId,
    slug: extractAnimeSlug(episodeUrl || url),
    episode: episodeNum,
    title: episodeTitle,
    animeTitle,
    credit,
    servers,
    downloads,
    checkValue,
    csrfToken,
    navigation: episodeGuide.navigation,
    episodes: episodeGuide.episodes,
    img: animeHtml ? extractCover(animeHtml).cover : '',
    url: episodeUrl,
  };
}

// ─── Schedule ──────────────────────────────────

export async function scrapeSchedule(day) {
  const dayMap = { senin: 'monday', selasa: 'tuesday', rabu: 'wednesday', kamis: 'thursday', jumat: 'friday', sabtu: 'saturday', minggu: 'sunday' };
  const engDay = dayMap[day?.toLowerCase()] || day || 'wednesday';
  const url = `${BASE_URL}/schedule?scheduled_day=${engDay}`;
  const html = await getText(url);
  const $ = cheerio.load(html);

  const schedule = [];
  $('.product__item').each((_, el) => {
    const $el = $(el);
    // Title dari .product__item__text h5
    const title = $el.find('.product__item__text h5 a').text().trim() 
                 || $el.find('.product__item__text h5').text().trim();
    const link = $el.find('.product__item__text h5 a').attr('href') 
                || $el.find('a[href*="/anime/"]').first().attr('href') 
                || '';
    const img = $el.find('.set-bg').attr('data-setbg') || '';
    // Episode dari hidden input actual-schedule-ep-{id}-real
    const epVal = $el.parent().find('[class*="actual-schedule-ep-"][class$="-real"]').val()
                 || $el.parent().parent().find('[class*="actual-schedule-ep-"][class$="-real"]').val()
                 || '';
    // Waktu dari span.actual-schedule-info-{id} (kedua: clock)
    const infoSpans = $el.find('[class*="actual-schedule-info-"]');
    const airDay = infoSpans.eq(0).text().trim();
    const airTime = infoSpans.eq(1).text().trim();
    if (title) schedule.push({ 
      title, 
      episode: epVal ? parseInt(epVal) : null, 
      airDay: airDay || null, 
      airTime: airTime || null, 
      img, 
      url: link, 
      id: extractId(link),
      slug: extractAnimeSlug(link),
    });
  });

  return { day: engDay, schedule };
}

// ─── Quick Lists ────────────────────────────────

export async function scrapeQuickList(type, params = {}) {
  const url = `${BASE_URL}/quick/${type}?order_by=text`;
  const html = await getText(url);
  const $ = cheerio.load(html);

  // Quick list uses a.anime__list__link format: "(Ep X/ Y) Title"
  const results = [];
  const seen = new Set();
  $('a.anime__list__link[href*="/anime/"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const animeUrl = href.replace(/\/episode\/\d+$/, '');
    if (seen.has(animeUrl)) return;
    seen.add(animeUrl);

    const text = $el.text().replace(/\s+/g, ' ').trim();
    const epMatch = text.match(/\(Ep\s*(\d+)\s*\/\s*(\d+)\)/);
    const title = text.replace(/^\(Ep\s*\d+\s*\/\s*\d+\)\s*/, '').replace(/&quot;/g, '"').trim();
    const id = extractId(href);
    const slug = extractSlug(href);
    if (title) results.push({
      id,
      slug,
      title,
      episode: epMatch ? parseInt(epMatch[1]) : null,
      totalEpisodes: epMatch ? parseInt(epMatch[2]) : null,
      url: animeUrl,
    });
  });

  const paginated = paginateQuickList(results, params);
  const pageResults = paginated.includeImages
    ? await enrichWithCovers(paginated.results)
    : paginated.results.map(({ img: _img, ...item }) => item);

  return {
    type,
    results: pageResults,
    pagination: paginated.pagination,
    includeImages: paginated.includeImages,
  };
}

// ─── Helpers ────────────────────────────────────

function extractId(url) {
  const m = url.match(/\/anime\/(\d+)/);
  return m ? m[1] : null;
}

function extractSlug(url) {
  const m = url.match(/\/anime\/(?:\d+\/)?([^/]+)/);
  return m ? m[1] : '';
}
