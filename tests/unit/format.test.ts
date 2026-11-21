import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { pdfDetails } from '../../src/lib/format';

describe('pdfDetails', () => {
  test('all pages sent', () => {
    assert.equal(pdfDetails(3, 3), 'PDF · 3 pages');
  });

  test('one page', () => {
    assert.equal(pdfDetails(1, 1), 'PDF · 1 page');
  });

  test('a long PDF says how many pages went', () => {
    assert.equal(pdfDetails(80, 50), 'PDF · 80 pages · first 50 sent');
  });

  test('without a page count it is just "PDF"', () => {
    assert.equal(pdfDetails(undefined, 0), 'PDF');
  });
});
