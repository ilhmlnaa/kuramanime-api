import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateQuickList } from '../src/services/quickList.js';

test('paginateQuickList defaults to 20 items on page 1', () => {
  const items = Array.from({ length: 45 }, (_, index) => ({ id: String(index + 1) }));
  const result = paginateQuickList(items, {});

  assert.equal(result.results.length, 20);
  assert.deepEqual(result.pagination, {
    currentPage: 1,
    totalPages: 3,
    totalItems: 45,
    limit: 20,
    hasNextPage: true,
    hasPrevPage: false,
  });
});

test('paginateQuickList clamps limit to 50 and selects requested page', () => {
  const items = Array.from({ length: 120 }, (_, index) => ({ id: String(index + 1) }));
  const result = paginateQuickList(items, { page: '2', limit: '100' });

  assert.equal(result.results[0].id, '51');
  assert.equal(result.results.length, 50);
  assert.equal(result.pagination.limit, 50);
  assert.equal(result.pagination.currentPage, 2);
});

test('paginateQuickList can disable image enrichment', () => {
  const items = [{ id: '1' }];
  const result = paginateQuickList(items, { includeImages: 'false' });

  assert.equal(result.includeImages, false);
});
