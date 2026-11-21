import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { endsSession, friendlyError, isReplayable, isSessionError } from '../../src/api/errors';
import { ApiError, NetworkError, TimeoutError } from '../../src/api/http';

const api = (status: number, code: string, message = 'server message', details = []) =>
  new ApiError({ status, code, message, details });

describe('isSessionError', () => {
  test('is true when the token is wrong, revoked or missing', () => {
    assert.equal(isSessionError(api(401, 'invalid_credential')), true);
    assert.equal(isSessionError(api(401, 'authentication_required')), true);
  });

  test('is false for a wrong sign-in code, even though it is a 401', () => {
    assert.equal(isSessionError(api(401, 'invalid_otp')), false);
  });

  test('is false for a network error', () => {
    assert.equal(isSessionError(new NetworkError()), false);
  });
});

describe('isReplayable', () => {
  test('is true when the answer may still come back', () => {
    assert.equal(isReplayable(new TimeoutError()), true);
    assert.equal(isReplayable(new NetworkError()), true);
    assert.equal(isReplayable(api(502, 'http_502')), true);
    assert.equal(isReplayable(api(504, 'http_504')), true);
    assert.equal(isReplayable(api(409, 'request_not_replayable')), true);
  });

  test('is false when the server rejected the question', () => {
    assert.equal(isReplayable(api(409, 'chat_busy')), false);
    assert.equal(isReplayable(api(429, 'daily_limit_reached')), false);
    assert.equal(isReplayable(api(422, 'validation_error')), false);
  });
});

describe('friendlyError', () => {
  const cases: [string, number, string][] = [
    ['invalid_otp', 401, 'That code is wrong or has expired.'],
    ['otp_rate_limited', 429, 'Please wait a minute before asking for another code.'],
    ['service_not_allowed', 403, "This feature isn't turned on for your account."],
    ['chat_not_found', 404, 'This chat no longer exists.'],
    [
      'chat_busy',
      409,
      'The last answer in this chat is still being written. Try again in a moment.',
    ],
    ['chat_not_active', 409, 'This chat is closed. Start a new chat.'],
    ['request_too_large', 413, "That's too much to send at once. Remove some pages or photos."],
    ['daily_limit_reached', 429, "You've used all of today's questions. Try again tomorrow."],
    ['rate_limited', 429, "You're sending too fast. Wait a moment and try again."],
    ['invalid_credential', 401, 'Your session ended. Please sign in again.'],
    ['authentication_required', 401, 'Your session ended. Please sign in again.'],
  ];

  for (const [code, status, message] of cases) {
    test(`explains ${code}`, () => {
      assert.equal(friendlyError(api(status, code)), message);
    });
  }

  test('explains a phone number in the wrong shape', () => {
    const error = new ApiError({
      status: 422,
      code: 'validation_error',
      message: 'Invalid request',
      details: [{ location: ['body', 'phone'], type: 'string_pattern_mismatch' }],
    });
    assert.equal(
      friendlyError(error),
      'Enter your number with the country code, like +91 98765 43210.',
    );
  });

  test('explains a network error', () => {
    assert.equal(
      friendlyError(new NetworkError()),
      "Can't reach Sovrns. Check your internet connection.",
    );
  });

  test('explains a timeout', () => {
    assert.equal(
      friendlyError(new TimeoutError()),
      'Sovrns is taking too long to answer. Try again.',
    );
  });

  test("uses the server's message for an unknown code", () => {
    assert.equal(friendlyError(api(400, 'something_new', 'Boom')), 'Boom');
  });

  test('falls back for anything else', () => {
    assert.equal(friendlyError('not an error'), 'Something went wrong. Try again.');
  });
});

describe('endsSession', () => {
  test('any 401 from a signed-in call ends the session', () => {
    assert.equal(endsSession(api(401, 'token_expired')), true);
    assert.equal(endsSession(api(401, 'invalid_credential')), true);
  });

  test('the session codes end it whatever the status', () => {
    assert.equal(endsSession(api(403, 'authentication_required')), true);
  });

  test('other errors do not', () => {
    assert.equal(endsSession(api(403, 'service_not_allowed')), false);
    assert.equal(endsSession(api(409, 'chat_busy')), false);
    assert.equal(endsSession(new NetworkError()), false);
  });
});
