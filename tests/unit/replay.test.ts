import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError, NetworkError, TimeoutError } from '../../src/api/http';
import { askWithReplay } from '../../src/chat/replay';

/** A fake clock: each `send` takes `costMs`, each wait takes the time asked for. */
function fakeTime(costMs = 0) {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
    spend: () => {
      now += costMs;
    },
  };
}

/** A `send` that answers from a script, one entry per call: an Error is thrown, anything else returned. */
function scripted(script: unknown[], time = fakeTime()) {
  let calls = 0;
  const send = async () => {
    const step = script[Math.min(calls, script.length - 1)];
    calls++;
    time.spend();
    if (step instanceof Error) throw step;
    return step as string;
  };
  return { send, calls: () => calls, time };
}

const api = (status: number, code: string) => new ApiError({ status, code, message: code });

describe('askWithReplay', () => {
  test('returns at once on success', async () => {
    const run = scripted(['answer']);
    assert.equal(
      await askWithReplay(run.send, { sleep: run.time.sleep, now: run.time.now }),
      'answer',
    );
    assert.equal(run.calls(), 1);
  });

  test('re-sends after a 504', async () => {
    const run = scripted([api(504, 'http_504'), 'answer']);
    assert.equal(
      await askWithReplay(run.send, { sleep: run.time.sleep, now: run.time.now }),
      'answer',
    );
    assert.equal(run.calls(), 2);
  });

  test('re-sends while the server is still answering', async () => {
    const busy = api(409, 'request_not_replayable');
    const run = scripted([busy, busy, 'answer']);
    assert.equal(
      await askWithReplay(run.send, { sleep: run.time.sleep, now: run.time.now }),
      'answer',
    );
    assert.equal(run.calls(), 3);
  });

  test('does not re-send a rejected question', async () => {
    const run = scripted([api(409, 'chat_busy'), 'answer']);
    await assert.rejects(
      askWithReplay(run.send, { sleep: run.time.sleep, now: run.time.now }),
      (error: unknown) => error instanceof ApiError && error.code === 'chat_busy',
    );
    assert.equal(run.calls(), 1);
  });

  test('gives up after maxMs', async () => {
    const time = fakeTime(65_000);
    const run = scripted([new TimeoutError()], time);
    await assert.rejects(
      askWithReplay(run.send, { sleep: time.sleep, now: time.now, maxMs: 180_000 }),
      TimeoutError,
    );
    assert.ok(run.calls() >= 2 && run.calls() <= 4, `calls: ${run.calls()}`);
  });

  test('fails fast on repeated network errors', async () => {
    const run = scripted([new NetworkError(), new NetworkError(), 'answer']);
    await assert.rejects(
      askWithReplay(run.send, { sleep: run.time.sleep, now: run.time.now }),
      NetworkError,
    );
    assert.equal(run.calls(), 2);
  });

  test('waits longer each time: 3 s, 6 s, 12 s, then 15 s at most', async () => {
    const busy = api(409, 'request_not_replayable');
    const time = fakeTime();
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      await time.sleep(ms);
    };
    const run = scripted([busy, busy, busy, busy, busy, 'answer'], time);
    assert.equal(await askWithReplay(run.send, { sleep, now: time.now }), 'answer');
    assert.deepEqual(waits, [3000, 6000, 12000, 15000, 15000]);
  });

  test('tells the caller each time it re-sends', async () => {
    const run = scripted([api(502, 'http_502'), 'answer']);
    const attempts: number[] = [];
    await askWithReplay(run.send, {
      sleep: run.time.sleep,
      now: run.time.now,
      onRetry: (attempt) => attempts.push(attempt),
    });
    assert.deepEqual(attempts, [1]);
  });
});
