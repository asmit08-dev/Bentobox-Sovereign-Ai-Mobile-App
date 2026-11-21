// A hidden 1×1 WebView that draws PDF pages for renderPdf.ts. Mounted while signed in.
// It says "ready" once loaded (ok false when PDF.js couldn't load); it is loaded again when
// that failed or when the system ended its process.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { PDFJS_INTEGRITY, PDFJS_URL, pdfScript } from './pdfScript';
import { handlePdfMessage, pdfHostGone, setPdfHost } from './renderPdf';

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script src="${PDFJS_URL}" integrity="${PDFJS_INTEGRITY}" crossorigin="anonymous"></script>
<script>${pdfScript}
window.__startPdfJob = function (jobId, base64, opts) {
  function post(message) {
    message.jobId = jobId;
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  window.__renderPdf(base64, opts,
    function (page) { post({ type: 'page', page: page }); },
    function (totalPages) { post({ type: 'done', totalPages: totalPages }); },
    function (reason) { post({ type: 'error', reason: reason }); });
};
window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', ok: Boolean(window.pdfjsLib) }));
</script></head><body></body></html>`;

// The package types default their props to `never` (WebView<undefined>); `object` fixes it.
type PdfWebView = WebView<object>;

export function PdfRendererHost() {
  const webView = useRef<PdfWebView>(null);
  // A new number mounts a new WebView, which loads PDF.js again.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    setPdfHost({
      run: (script) => webView.current?.injectJavaScript(script),
      reload: () => setGeneration((value) => value + 1),
    });
    return () => setPdfHost(null);
  }, []);

  return (
    <View style={styles.host} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <WebView<object>
        key={generation}
        ref={webView}
        source={{ html: PAGE }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(event) => handlePdfMessage(event.nativeEvent.data)}
        onContentProcessDidTerminate={() => pdfHostGone()}
        onRenderProcessGone={() => pdfHostGone()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
