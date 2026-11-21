// The PDF page drawer, shared by the phone renderer (inside a hidden WebView) and the web
// preview (inside the page). It uses PDF.js from cdnjs. No React Native imports.

export const PDFJS_VERSION = '3.11.174';
export const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
/** Subresource integrity of pdf.min.js 3.11.174: the browser refuses a changed file. */
export const PDFJS_INTEGRITY =
  'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

/** Options for one PDF: the first `maxPages` pages, longest side `maxEdge` px, JPEG `quality`. */
export type PdfRenderOptions = { maxPages: number; maxEdge: number; quality: number };

export type PdfPage = { base64: string; width: number; height: number };

/**
 * Defines `window.__renderPdf(base64, opts, onPage, onDone, onError)`. Each page is drawn on a
 * white canvas (JPEG has no see-through parts) at `maxEdge / longest side`, then sent to
 * `onPage` as JPEG base64, one page at a time. `onDone` gets the PDF's page count.
 */
export const pdfScript = `
(function () {
  function bytesOf(base64) {
    var raw = atob(base64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function reason(error) {
    return String((error && error.message) || error || 'unknown');
  }
  window.__renderPdf = function (base64, opts, onPage, onDone, onError) {
    var lib = window.pdfjsLib;
    if (!lib) {
      onError('PDF.js did not load');
      return;
    }
    lib.GlobalWorkerOptions.workerSrc = '${PDFJS_WORKER_URL}';
    // isEvalSupported false: PDF.js before 4.2.67 could run code from a crafted PDF
    // through eval (CVE-2024-4367).
    lib.getDocument({ data: bytesOf(base64), isEvalSupported: false }).promise.then(function (doc) {
      var total = doc.numPages;
      var count = Math.min(total, opts.maxPages);
      var number = 0;
      function next() {
        if (number >= count) {
          doc.destroy();
          onDone(total);
          return;
        }
        number += 1;
        doc.getPage(number).then(function (page) {
          var natural = page.getViewport({ scale: 1 });
          var scale = opts.maxEdge / Math.max(natural.width, natural.height);
          var viewport = page.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          var context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          return page.render({ canvasContext: context, viewport: viewport }).promise.then(function () {
            var url = canvas.toDataURL('image/jpeg', opts.quality);
            onPage({ base64: url.slice(url.indexOf(',') + 1), width: canvas.width, height: canvas.height });
            page.cleanup();
            canvas.width = 0;
            canvas.height = 0;
            next();
          });
        }).catch(function (error) {
          onError(reason(error));
        });
      }
      next();
    }, function (error) {
      onError(reason(error));
    });
  };
})();
`;
