import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';

import { PDF_CANT_OPEN, createPdfRenderer } from '../../src/lib/pdf/renderPdf';

const options = { maxPages: 50, maxEdge: 1400, quality: 0.7 };
const page = { base64: 'AAA', width: 10, height: 14 };
const message = (fields: object) => JSON.stringify(fields);

function fakeHost() {
  const runs: string[] = [];
  let reloads = 0;
  return {
    host: { run: (script: string) => runs.push(script), reload: () => (reloads += 1) },
    runs,
    reloads: () => reloads,
  };
}

/** The job id inside `window.__startPdfJob("id", "base64", {...}); true;`. */
const jobIdOf = (script: string) =>
  JSON.parse(`[${script.slice(script.indexOf('(') + 1, script.lastIndexOf(')'))}]`)[0] as string;

const cantOpen = (error: unknown) => error instanceof Error && error.message === PDF_CANT_OPEN;

describe('PDF renderer jobs', () => {
  test('a job waits until the WebView has PDF.js, then gets its pages one by one', async () => {
    const renderer = createPdfRenderer();
    const fake = fakeHost();
    renderer.setHost(fake.host);
    const job = renderer.render('PDF', options);
    assert.equal(fake.runs.length, 0);
    renderer.handleMessage(message({ type: 'ready', ok: true }));
    assert.equal(fake.runs.length, 1);
    const jobId = jobIdOf(fake.runs[0]);
    renderer.handleMessage(message({ jobId, type: 'page', page }));
    renderer.handleMessage(message({ jobId, type: 'done', totalPages: 3 }));
    assert.deepEqual(await job, { pages: [page], totalPages: 3 });
  });

  test('the time limit starts again with every page', async (t) => {
    mock.timers.enable({ apis: ['setTimeout'] });
    t.after(() => mock.timers.reset());
    const renderer = createPdfRenderer();
    const fake = fakeHost();
    renderer.setHost(fake.host);
    renderer.handleMessage(message({ type: 'ready', ok: true }));
    const slow = renderer.render('PDF', options);
    const jobId = jobIdOf(fake.runs[0]);
    mock.timers.tick(50_000);
    renderer.handleMessage(message({ jobId, type: 'page', page }));
    mock.timers.tick(50_000);
    renderer.handleMessage(message({ jobId, type: 'done', totalPages: 1 }));
    assert.equal((await slow).pages.length, 1);

    const stuck = renderer.render('PDF', options);
    mock.timers.tick(60_001);
    await assert.rejects(stuck, cantOpen);
  });

  test('if PDF.js did not load, waiting jobs fail and the next job reloads the WebView', async () => {
    const renderer = createPdfRenderer();
    const fake = fakeHost();
    renderer.setHost(fake.host);
    const first = renderer.render('PDF', options);
    renderer.handleMessage(message({ type: 'ready', ok: false }));
    await assert.rejects(first, cantOpen);
    const second = renderer.render('PDF', options);
    assert.equal(fake.reloads(), 1);
    renderer.handleMessage(message({ type: 'ready', ok: true }));
    const jobId = jobIdOf(fake.runs[0]);
    renderer.handleMessage(message({ jobId, type: 'done', totalPages: 1 }));
    assert.deepEqual(await second, { pages: [], totalPages: 1 });
  });

  test('when the WebView process dies, running jobs fail at once and it reloads', async () => {
    const renderer = createPdfRenderer();
    const fake = fakeHost();
    renderer.setHost(fake.host);
    renderer.handleMessage(message({ type: 'ready', ok: true }));
    const job = renderer.render('PDF', options);
    renderer.hostGone();
    await assert.rejects(job, cantOpen);
    assert.equal(fake.reloads(), 1);
  });

  test('an error fails only its own job', async () => {
    const renderer = createPdfRenderer();
    const fake = fakeHost();
    renderer.setHost(fake.host);
    renderer.handleMessage(message({ type: 'ready', ok: true }));
    const broken = renderer.render('BAD', options);
    const fine = renderer.render('PDF', options);
    renderer.handleMessage(message({ jobId: jobIdOf(fake.runs[0]), type: 'error', reason: 'x' }));
    renderer.handleMessage(message({ jobId: jobIdOf(fake.runs[1]), type: 'done', totalPages: 2 }));
    await assert.rejects(broken, cantOpen);
    assert.equal((await fine).totalPages, 2);
  });
});
