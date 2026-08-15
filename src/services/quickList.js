function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return !['0', 'false', 'no'].includes(String(value).toLowerCase());
}

export function paginateQuickList(items, params = {}) {
  const limit = Math.min(parsePositiveInteger(params.limit, 20), 50);
  const requestedPage = parsePositiveInteger(params.page, 1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const currentPage = Math.min(requestedPage, totalPages);
  const start = (currentPage - 1) * limit;

  return {
    results: items.slice(start, start + limit),
    includeImages: parseBoolean(params.includeImages, true),
    pagination: {
      currentPage,
      totalPages,
      totalItems,
      limit,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    },
  };
}
