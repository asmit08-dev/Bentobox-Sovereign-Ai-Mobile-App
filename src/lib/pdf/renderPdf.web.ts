// WEB PREVIEW: draws PDF pages in the page itself, with PDF.js loaded from cdnjs once.
// Phones use renderPdf.ts (a hidden WebView).
import {
  PDFJS_INTEGRITY,
  PDFJS_URL,
  pdfScript,
  type PdfPage,
  type PdfRenderOptions,
} from './pdfScript';

export const PDF_CANT_OPEN = "This PDF can't be opened.";
// A PDF fails when no page arrives for this long (the limit starts again with every page).
const PAGE_TIMEOUT_MS = 60_000;

type RenderPdf = (
  base64: string,
  options: PdfRenderOptions,
  onPage: (page: PdfPage) => void,
  onDone: (totalPages: number) => void,
  onError: (reason: string) => void,
) => void;

declare global {
  interface Window {
    __renderPdf?: RenderPdf;
  }
}

let ready: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.integrity = PDFJS_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('PDF.js did not load.'));
    document.head.appendChild(script);
  });
}

function loadRenderer() {
  ready ??= loadScript(PDFJS_URL)
    .then(() => {
      const script = document.createElement('script');
      script.text = pdfScript;
      document.head.appendChild(script);
    })
    .catch((error: unknown) => {
      ready = null; // Try again next time (for example after being offline).
      throw error;
    });
  return ready;
}

/** Draws the first pages of a PDF as JPEGs. Rejects with "This PDF can't be opened." */
export async function renderPdfPages(base64: string, options: PdfRenderOptions) {
  try {
    await loadRenderer();
  } catch {
    throw new Error(PDF_CANT_OPEN);
  }
  const render = window.__renderPdf;
  if (!render) throw new Error(PDF_CANT_OPEN);
  return new Promise<{ pages: PdfPage[]; totalPages: number }>((resolve, reject) => {
    const pages: PdfPage[] = [];
    let timer = setTimeout(() => reject(new Error(PDF_CANT_OPEN)), PAGE_TIMEOUT_MS);
    render(
      base64,
      options,
      (page) => {
        pages.push(page);
        clearTimeout(timer);
        timer = setTimeout(() => reject(new Error(PDF_CANT_OPEN)), PAGE_TIMEOUT_MS);
      },
      (totalPages) => {
        clearTimeout(timer);
        resolve({ pages, totalPages });
      },
      () => {
        clearTimeout(timer);
        reject(new Error(PDF_CANT_OPEN));
      },
    );
  });
}
