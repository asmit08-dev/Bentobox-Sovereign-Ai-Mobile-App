// PHONES: draws PDF pages in a hidden WebView (PdfRendererHost, mounted while signed in),
// because native PDF libraries need a development build and the app runs in Expo Go.
// A job goes in with injectJavaScript; each page comes back as its own postMessage.
// No React Native imports: Node tests the job rules.
import type { PdfPage, PdfRenderOptions } from './pdfScript';

export const PDF_CANT_OPEN = "This PDF can't be opened.";
// A job fails when no page arrives for this long. The limit starts again with every page,
// so a long PDF on a slow phone isn't cut off as a whole.
const PAGE_TIMEOUT_MS = 60_000;

type Result = { pages: PdfPage[]; totalPages: number };

type Job = {
  base64: string;
  options: PdfRenderOptions;
  pages: PdfPage[];
  resolve: (result: Result) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

/** The WebView: runs a script in it, or loads it again. */
type Host = { run: (script: string) => void; reload: () => void };

/**
 * The job rules. The WebView says "ready" once it has loaded (with ok false when PDF.js
 * couldn't load, for example offline): jobs wait for it, and the next job after a failed load
 * (or after the WebView's process died) loads it again.
 */
export function createPdfRenderer() {
  let host: Host | null = null;
  let state: 'loading' | 'ready' | 'broken' = 'loading';
  let count = 0;
  const jobs = new Map<string, Job>();
  const waiting: string[] = [];
  const running = new Set<string>();

  function finish(jobId: string, error?: Error, totalPages = 0) {
    const job = jobs.get(jobId);
    if (!job) return;
    jobs.delete(jobId);
    running.delete(jobId);
    const queued = waiting.indexOf(jobId);
    if (queued !== -1) waiting.splice(queued, 1);
    clearTimeout(job.timer);
    if (error) job.reject(error);
    else job.resolve({ pages: job.pages, totalPages });
  }

  function arm(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) return;
    clearTimeout(job.timer);
    job.timer = setTimeout(() => finish(jobId, new Error(PDF_CANT_OPEN)), PAGE_TIMEOUT_MS);
  }

  function start(jobId: string) {
    const job = jobs.get(jobId);
    if (!job || !host) return;
    running.add(jobId);
    arm(jobId);
    const args = [jobId, job.base64, job.options].map((value) => JSON.stringify(value)).join(',');
    host.run(`window.__startPdfJob(${args}); true;`);
  }

  function reload() {
    if (!host) return;
    state = 'loading';
    host.reload();
  }

  return {
    /** The WebView is mounted (or gone, with null: its jobs fail). */
    setHost(next: Host | null) {
      host = next;
      state = 'loading';
      if (!next) for (const jobId of [...jobs.keys()]) finish(jobId, new Error(PDF_CANT_OPEN));
    },

    /** A message from the WebView: ready, a page, the end of a job, or an error. */
    handleMessage(data: string) {
      let message: {
        type?: string;
        ok?: boolean;
        jobId?: string;
        page?: PdfPage;
        totalPages?: number;
      };
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (message.type === 'ready') {
        state = message.ok === true ? 'ready' : 'broken';
        for (const jobId of waiting.splice(0)) {
          if (state === 'ready') start(jobId);
          else finish(jobId, new Error(PDF_CANT_OPEN));
        }
        return;
      }
      const jobId = message.jobId ?? '';
      if (message.type === 'page' && message.page) {
        const job = jobs.get(jobId);
        if (!job) return;
        job.pages.push(message.page);
        arm(jobId);
      } else if (message.type === 'done') {
        finish(jobId, undefined, message.totalPages ?? 0);
      } else if (message.type === 'error') {
        finish(jobId, new Error(PDF_CANT_OPEN));
      }
    },

    /** The WebView's process died: its running jobs can't finish. It loads again. */
    hostGone() {
      for (const jobId of [...running]) finish(jobId, new Error(PDF_CANT_OPEN));
      reload();
    },

    /** Draws the first pages of a PDF as JPEGs. Rejects with "This PDF can't be opened." */
    render(base64: string, options: PdfRenderOptions) {
      return new Promise<Result>((resolve, reject) => {
        count += 1;
        const jobId = `pdf-${count}`;
        jobs.set(jobId, { base64, options, pages: [], resolve, reject });
        arm(jobId);
        if (host && state === 'ready') {
          start(jobId);
          return;
        }
        waiting.push(jobId);
        if (state === 'broken') reload();
      });
    },
  };
}

const renderer = createPdfRenderer();

export const setPdfHost = renderer.setHost;
export const handlePdfMessage = renderer.handleMessage;
export const pdfHostGone = renderer.hostGone;

/** Draws the first pages of a PDF as JPEGs. Rejects with "This PDF can't be opened." */
export function renderPdfPages(base64: string, options: PdfRenderOptions) {
  return renderer.render(base64, options);
}
