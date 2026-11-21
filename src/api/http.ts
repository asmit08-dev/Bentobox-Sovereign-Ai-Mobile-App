// The one place that talks HTTP to the Sovrns API.
// No React Native imports here: Node runs the tests against this file.
import type { ApiErrorBody, ApiErrorDetail } from './types';

let baseUrl = 'https://sovrns.com';
/** Requests without their own timeout give up after this long (Android sets none). */
export const DEFAULT_TIMEOUT_MS = 20_000;
let defaultTimeoutMs = DEFAULT_TIMEOUT_MS;

/** Sets where the API lives. Called once at start-up (see config.ts). */
export function configureApi(options: { baseUrl: string; defaultTimeoutMs?: number }) {
  baseUrl = options.baseUrl.replace(/\/+$/, '');
  defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
}

/** The server answered with an error. `message` is the server's own words. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(options: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
  }
}

/** The request never reached the server (no internet, or the connection dropped). */
export class NetworkError extends Error {
  constructor() {
    super("Can't reach the server.");
    this.name = 'NetworkError';
  }
}

/** The server took longer than the time we allowed. It may still finish. */
export class TimeoutError extends Error {
  constructor() {
    super('The server took too long to answer.');
    this.name = 'TimeoutError';
  }
}

export type ApiRequestOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** A string is sent as it is (a saved request); anything else is sent as JSON. */
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** For tests. */
  fetchImpl?: typeof fetch;
};

async function errorFrom(response: Response) {
  const fallback = {
    status: response.status,
    code: `http_${response.status}`,
    message: `The server returned an error (${response.status}).`,
  };
  if (!(response.headers.get('content-type') ?? '').includes('json')) return new ApiError(fallback);
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    const error = body.error;
    if (!error || typeof error.code !== 'string') return new ApiError(fallback);
    return new ApiError({
      status: response.status,
      code: error.code,
      message:
        typeof error.message === 'string' && error.message ? error.message : fallback.message,
      details: Array.isArray(error.details) ? error.details : [],
    });
  } catch {
    return new ApiError(fallback);
  }
}

/** Sends one request. Resolves with the parsed JSON, or rejects with ApiError, NetworkError or TimeoutError. */
export async function apiRequest<T>(options: ApiRequestOptions): Promise<T> {
  const { path, method = 'GET', body, token, idempotencyKey, signal, timeoutMs } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  // One controller ends the request when the caller aborts or when the time runs out.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs ?? defaultTimeoutMs);
  const onCallerAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onCallerAbort);

  try {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body:
          body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new TimeoutError();
      if (signal?.aborted) throw error;
      throw new NetworkError();
    }
    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;
    try {
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch {
      if (timedOut) throw new TimeoutError();
      // A 2xx whose body can't be read or isn't JSON (a Wi-Fi login page, a cut connection)
      // didn't come from Sovrns: treat it as a failed connection, so a question keeps its key.
      throw new NetworkError();
    }
  } catch (error) {
    // The body can also be cut off by the timer while it is being read.
    if (timedOut && !(error instanceof ApiError)) throw new TimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
