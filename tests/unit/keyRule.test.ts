import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError, NetworkError } from '../../src/api/http';
import { canStartOver } from '../../src/chat/keyRule';

const api = (status: number, code: string) => new ApiError({ status, code, message: code });

describe('canStartOver', () => {
  test('the server refused the first send: a new key is safe', () => {
    assert.equal(canStartOver(api(422, 'validation_error'), true), true);
    assert.equal(canStartOver(api(429, 'daily_limit_reached'), true), true);
    assert.equal(canStartOver(api(401, 'invalid_credential'), true), true);
  });

  test('after a re-send the first send may still be answered: keep the key', () => {
    assert.equal(canStartOver(api(401, 'invalid_credential'), false), false);
    assert.equal(canStartOver(api(422, 'validation_error'), false), false);
  });

  test('errors that show the server knows the key never start over', () => {
    for (const code of ['idempotency_mismatch', 'request_not_replayable', 'chat_busy']) {
      assert.equal(canStartOver(api(409, code), true), false, code);
    }
  });

  test('anything that is not a 4xx keeps the key', () => {
    assert.equal(canStartOver(api(503, 'http_503'), true), false);
    assert.equal(canStartOver(new NetworkError(), true), false);
    assert.equal(canStartOver(new TypeError('boom'), true), false);
  });
});
