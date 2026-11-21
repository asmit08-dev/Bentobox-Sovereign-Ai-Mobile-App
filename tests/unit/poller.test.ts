import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { createPoller } from '../../src/chat/poller';

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => mock.timers.reset());

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function tick(ms: number) {
  mock.timers.tick(ms);
  await flush();
}

/** A poller whose looks answer from a script: true = still waiting, false = done, Error = failed. */
function setup(script: (boolean | Error)[] = []) {
  const looks: string[] = [];
  const gaveUp: string[] = [];
  let open = true;
  const poller = createPoller({
    everyMs: 4000,
    forMs: 12_000,
    isOpen: () => open,
    look: async (chatId) => {
      looks.push(chatId);
      const next = script.shift() ?? true;
      if (next instanceof Error) throw next;
      return next;
    },
    giveUp: (chatId) => gaveUp.push(chatId),
  });
  return { poller, looks, gaveUp, close: () => (open = false) };
}

test('looks again every interval until the answer is there', async () => {
  const t = setup([true, false]);
  t.poller.schedule('c1');
  await tick(4000);
  await tick(4000);
  await tick(4000);
  assert.deepEqual(t.looks, ['c1', 'c1']);
  assert.deepEqual(t.gaveUp, []);
});

test('a failed look tries again at the next interval', async () => {
  const t = setup([new Error('offline'), false]);
  t.poller.schedule('c1');
  await tick(4000);
  await tick(4000);
  assert.equal(t.looks.length, 2);
});

test('after the time limit it stops and gives up on the waiting dots', async () => {
  const t = setup();
  t.poller.schedule('c1');
  for (let i = 0; i < 5; i += 1) await tick(4000);
  assert.deepEqual(t.gaveUp, ['c1']);
  assert.equal(t.looks.length, 2);
});

test('scheduling twice keeps one timer per chat', async () => {
  const t = setup([false]);
  t.poller.schedule('c1');
  t.poller.schedule('c1');
  await tick(4000);
  assert.equal(t.looks.length, 1);
});

test('a closed chat stops quietly', async () => {
  const t = setup();
  t.poller.schedule('c1');
  t.close();
  await tick(4000);
  assert.equal(t.looks.length, 0);
  assert.deepEqual(t.gaveUp, []);
});
