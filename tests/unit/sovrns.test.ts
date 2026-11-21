import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { TimeoutError, configureApi } from '../../src/api/http';
import * as api from '../../src/api/sovrns';

test('a question may take up to 65 s before it times out (other calls stop at 20 s)', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    })) as unknown as typeof fetch;
  t.after(() => {
    mock.timers.reset();
    globalThis.fetch = original;
  });
  configureApi({ baseUrl: 'https://sovrns.com' });

  let settled = false;
  const pending = api
    .ask('sk-test', '{"question":"Hi"}', { idempotencyKey: 'k1' })
    .catch((error: unknown) => error)
    .finally(() => {
      settled = true;
    });
  mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  mock.timers.tick(35_001);
  assert.ok((await pending) instanceof TimeoutError);
});
