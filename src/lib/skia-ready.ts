/**
 * On iOS and Android, Skia is built in, so it is always ready.
 * The web version of this file (skia-ready.web.ts) loads Skia for the browser preview.
 */
export function useSkiaReady() {
  return true;
}
