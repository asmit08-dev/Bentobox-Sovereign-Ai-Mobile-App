import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ApiUser } from '../../src/api/types';
import { displayName, isExpired } from '../../src/auth/session';

describe('isExpired', () => {
  test('a token with no expiry never expires', () => {
    assert.equal(isExpired(null), false);
  });

  test('a past expiry has expired', () => {
    assert.equal(isExpired('2026-01-01T00:00:00Z', Date.parse('2026-01-02T00:00:00Z')), true);
  });

  test('a future expiry has not', () => {
    assert.equal(isExpired('2026-01-02T00:00:00Z', Date.parse('2026-01-01T00:00:00Z')), false);
  });

  test('a broken date does not sign anyone out', () => {
    assert.equal(isExpired('garbage'), false);
  });
});

describe('displayName', () => {
  const user = (fields: Partial<ApiUser>) =>
    ({
      id: 'u1',
      name: null,
      first_name: null,
      last_name: null,
      phone: null,
      ...fields,
    }) as ApiUser;

  test('uses the full name', () => {
    assert.equal(displayName(user({ name: 'Asha K' })), 'Asha K');
  });

  test('joins first and last name when there is no full name', () => {
    assert.equal(displayName(user({ first_name: 'Asha', last_name: 'K' })), 'Asha K');
  });

  test('is empty with no user', () => {
    assert.equal(displayName(null), '');
  });
});
