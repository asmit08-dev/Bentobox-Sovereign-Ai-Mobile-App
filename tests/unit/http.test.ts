import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { ApiError, NetworkError, TimeoutError, apiRequest, configureApi } from '../../src/api/http';

type Call = { url: string; init: RequestInit };

/** A fake fetch that records the call and answers with `response`. */
function fakeFetch(response: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  configureApi({ baseUrl: 'https://sovrns.com/' });
});

test('joins the base URL and the path', async () => {
  const { impl, calls } = fakeFetch(() => json(200, {}));
  await apiRequest({ path: '/api/v1/me', fetchImpl: impl });
  assert.equal(calls[0].url, 'https://sovrns.com/api/v1/me');
});

test('returns the parsed JSON body', async () => {
  const { impl } = fakeFetch(() => json(200, { ok: true }));
  const result = await apiRequest<{ ok: boolean }>({ path: '/x', fetchImpl: impl });
  assert.deepEqual(result, { ok: true });
});

test('sends the token, the idempotency key and a JSON body', async () => {
  const { impl, calls } = fakeFetch(() => json(200, {}));
  await apiRequest({
    path: '/ask',
    method: 'POST',
    body: { question: 'Hi' },
    token: 't1',
    idempotencyKey: 'k1',
    fetchImpl: impl,
  });
  const headers = new Headers(calls[0].init.headers);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(headers.get('authorization'), 'Bearer t1');
  assert.equal(headers.get('idempotency-key'), 'k1');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(calls[0].init.body, '{"question":"Hi"}');
});

test('sends a string body unchanged', async () => {
  const { impl, calls } = fakeFetch(() => json(200, {}));
  await apiRequest({ path: '/ask', method: 'POST', body: '{"a":1}', fetchImpl: impl });
  assert.equal(calls[0].init.body, '{"a":1}');
});

test('turns an error body into ApiError', async () => {
  const { impl } = fakeFetch(() => json(409, { error: { code: 'chat_busy', message: 'busy' } }));
  await assert.rejects(apiRequest({ path: '/ask', fetchImpl: impl }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'chat_busy');
    assert.equal(error.message, 'busy');
    return true;
  });
});

test('keeps the details of a validation error', async () => {
  const details = [{ location: ['body', 'phone'], type: 'string_pattern_mismatch' }];
  const { impl } = fakeFetch(() =>
    json(422, { error: { code: 'validation_error', message: 'Invalid request', details } }),
  );
  await assert.rejects(apiRequest({ path: '/x', fetchImpl: impl }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.deepEqual(error.details, details);
    return true;
  });
});

test('handles an HTML error page', async () => {
  const { impl } = fakeFetch(
    () =>
      new Response('<html>Gateway Timeout</html>', {
        status: 504,
        headers: { 'content-type': 'text/html' },
      }),
  );
  await assert.rejects(apiRequest({ path: '/ask', fetchImpl: impl }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 504);
    assert.equal(error.code, 'http_504');
    assert.equal(error.message, 'The server returned an error (504).');
    return true;
  });
});

test('wraps a failed fetch as NetworkError', async () => {
  const impl = (async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
  await assert.rejects(apiRequest({ path: '/x', fetchImpl: impl }), NetworkError);
});

/** A fetch that never answers; it only settles when its signal aborts. */
const hangingFetch = ((_url: string, init: RequestInit) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  })) as unknown as typeof fetch;

test('times out', async () => {
  await assert.rejects(
    apiRequest({ path: '/x', timeoutMs: 20, fetchImpl: hangingFetch }),
    TimeoutError,
  );
});

test("passes a caller's abort through", async () => {
  const controller = new AbortController();
  const pending = apiRequest({ path: '/x', signal: controller.signal, fetchImpl: hangingFetch });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => {
    assert.equal((error as Error).name, 'AbortError');
    return true;
  });
});

test('a request without its own timeout uses the default one', { timeout: 2000 }, async () => {
  configureApi({ baseUrl: 'https://sovrns.com/', defaultTimeoutMs: 20 });
  await assert.rejects(apiRequest({ path: '/x', fetchImpl: hangingFetch }), TimeoutError);
});

test('a 2xx answer whose body is not JSON counts as a network error', async () => {
  // For example a Wi-Fi login page: the question never reached Sovrns.
  const { impl } = fakeFetch(
    () =>
      new Response('<html>Sign in to Wi-Fi</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
  );
  await assert.rejects(apiRequest({ path: '/x', fetchImpl: impl }), NetworkError);
});
