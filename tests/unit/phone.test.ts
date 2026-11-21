import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DEFAULT_COUNTRY_CODE, formatPhone, toE164 } from '../../src/auth/phone';

describe('toE164', () => {
  test('starts with India', () => {
    assert.equal(DEFAULT_COUNTRY_CODE, '+91');
  });

  test('joins the country code and a number with spaces', () => {
    assert.equal(toE164('+91', '98765 43210'), '+919876543210');
  });

  test('accepts a country code without the plus and a number with dashes', () => {
    assert.equal(toE164('91', '98765-43210'), '+919876543210');
  });

  test('drops the leading 0 people type out of habit', () => {
    assert.equal(toE164('+91', '098765 43210'), '+919876543210');
  });

  test('keeps a full number pasted into the number field', () => {
    assert.equal(toE164('+91', '+91 98765 43210'), '+919876543210');
  });

  test('works for other countries', () => {
    assert.equal(toE164('+1', '(555) 555-0100'), '+15555550100');
  });

  test('refuses numbers that are too short, empty or not numbers', () => {
    assert.equal(toE164('+91', '123'), null);
    assert.equal(toE164('+91', 'abcd'), null);
    assert.equal(toE164('+91', ''), null);
  });
});

describe('formatPhone', () => {
  test('groups an Indian number', () => {
    assert.equal(formatPhone('+919876543210'), '+91 98765 43210');
  });

  test('leaves other numbers as they are', () => {
    assert.equal(formatPhone('+15555550100'), '+15555550100');
  });
});
