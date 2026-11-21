// When a question failed: may the next try use a new Idempotency-Key?
// No React Native imports: Node tests this file.
//
// A new key makes the next try a new question, charged again if the first one was answered.
// So a key is dropped only when the server clearly refused the very first send of it: a 4xx
// answer to that first send means nothing was answered or charged.
import { ApiError } from '../api/http';

// These say the server already knows this key, or may still be working on it.
const KEY_KNOWN = new Set(['idempotency_mismatch', 'request_not_replayable', 'chat_busy']);

/** `firstSend`: this key had never been sent before, and it was sent only once. */
export function canStartOver(error: unknown, firstSend: boolean) {
  if (!firstSend || !(error instanceof ApiError)) return false;
  if (error.status < 400 || error.status >= 500) return false;
  return !KEY_KNOWN.has(error.code);
}
