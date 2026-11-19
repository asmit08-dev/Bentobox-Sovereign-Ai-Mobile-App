// Web only: Skia needs its WebAssembly engine (CanvasKit) before anything is drawn.
// This is only for the browser preview (`npm run web`). Phones never load this file.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { version } from 'canvaskit-wasm/package.json';
import { useEffect, useState } from 'react';

const CANVASKIT_URL = `https://cdn.jsdelivr.net/npm/canvaskit-wasm@${version}/bin/full/`;

export function useSkiaReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    LoadSkiaWeb({ locateFile: (file: string) => `${CANVASKIT_URL}${file}` })
      .then(() => setReady(true))
      .catch((error: unknown) => console.error('Could not load Skia for web', error));
  }, []);

  return ready;
}
