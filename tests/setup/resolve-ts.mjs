import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node needs file extensions in imports; the app's code imports without them.
// For a relative import with no extension, try .ts, .tsx and /index.ts.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(specifier + ext, context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
  }
  return next(specifier, context);
}
