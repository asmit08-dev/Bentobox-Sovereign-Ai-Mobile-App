// Sending a question again when its answer was cut off on the way back.
// No React Native imports: Node tests this file.
//
// Why it is safe: every question carries an Idempotency-Key. Sending the same body with the
// same key again returns the same answer and is charged once (tested on the live server).
// While the server is still working on it, a replay gets 409 request_not_replayable.
import { isReplayable } from '../api/errors';
import { NetworkError } from '../api/http';

export type ReplayOptions = {
  /** Stop trying after this long in all (3 minutes). */
  maxMs?: number;
  /** Wait before the first re-send (3 seconds). It doubles each time, up to `maxWaitMs`. */
  waitMs?: number;
  /** The longest wait between tries (15 seconds). */
  maxWaitMs?: number;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
  /** For tests. */
  now?: () => number;
  /** Called before each new try, with 1 for the first replay. */
  onRetry?: (attempt: number) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `send`, and runs it again while the error means the answer may still come back
 * (a timeout, a 5xx such as CloudFront's 504, or "still processing"). A question the server
 * rejected is never sent again here. Two network errors in a row stop it early: the phone is
 * probably offline, and the person can tap Retry. The waits grow (3, 6, 12, then 15 s), so a
 * big question isn't uploaded again every 3 seconds while a slow answer is being written.
 */
export async function askWithReplay<T>(send: () => Promise<T>, options: ReplayOptions = {}) {
  const {
    maxMs = 180_000,
    waitMs = 3_000,
    maxWaitMs = 15_000,
    sleep = defaultSleep,
    now = Date.now,
    onRetry,
  } = options;
  const started = now();
  let networkErrorsInARow = 0;
  let attempt = 0;

  for (;;) {
    try {
      return await send();
    } catch (error) {
      if (!isReplayable(error)) throw error;
      networkErrorsInARow = error instanceof NetworkError ? networkErrorsInARow + 1 : 0;
      if (networkErrorsInARow >= 2) throw error;
      const wait = Math.min(waitMs * 2 ** attempt, maxWaitMs);
      if (now() - started + wait >= maxMs) throw error;
      attempt += 1;
      onRetry?.(attempt);
      await sleep(wait);
    }
  }
}
