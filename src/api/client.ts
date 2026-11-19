// Low-level helpers for talking to the backend.
import type { ApiErrorBody } from '@/api/contract';

/**
 * Where the backend lives. Empty means "the dev server that serves this app",
 * which runs the mock backend in src/app/api. Set EXPO_PUBLIC_API_URL in
 * `.env.local` to point the app at the real backend.
 */
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const usingMockBackend = API_URL === '';

/**
 * A full URL for an API path. With no API_URL the path stays relative: the global
 * `fetch` sends it to the dev server (on phones Expo resolves it, on web the page does).
 */
export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

/** The server answered, but with an error status. `message` is safe to show. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The request never reached the server: no internet, or the dev server is not running. */
export class NetworkError extends Error {
  constructor() {
    super(
      usingMockBackend
        ? "Can't reach the server. Check the Wi-Fi, and that `npx expo start` is still running."
        : "Can't reach the server. Check your internet connection.",
    );
    this.name = 'NetworkError';
  }
}

/** Builds an ApiError from an error response, using the server's message when there is one. */
export async function errorFromResponse(response: Response) {
  let message = `The server returned an error (${response.status}).`;
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (typeof body.error?.message === 'string' && body.error.message) {
      message = body.error.message;
    }
  } catch {
    // Not JSON. Keep the general message.
  }
  return new ApiError(message, response.status);
}

/** fetch() that turns "could not connect" into a NetworkError. Aborts are passed through. */
export async function request(path: string, init: RequestInit) {
  try {
    return await fetch(apiUrl(path), init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new NetworkError();
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { method: 'GET', signal });
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as T;
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as T;
}
