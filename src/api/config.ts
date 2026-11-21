// Where the app finds the API. Phones call sovrns.com directly. The web preview can't
// (the server blocks browser calls from localhost), so it goes through the dev server's
// pass-through route: src/app/api/sovrns/[...path]+api.ts.
import { Platform } from 'react-native';

import { configureApi } from '@/api/http';

/** Set EXPO_PUBLIC_API_URL in .env.local to use another server. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://sovrns.com').replace(
  /\/+$/,
  '',
);

/** Called once, when the app starts. */
export function setupApi() {
  configureApi({ baseUrl: Platform.OS === 'web' ? '/api/sovrns' : API_URL });
}
