// What an error means for the app, and how to say it in plain words.
// No React Native imports here: Node runs the tests against this file.
import { ApiError, NetworkError, TimeoutError } from './http';

const SESSION_ENDED = 'Your session ended. Please sign in again.';

/** Messages for the server's error codes (spec 5.1). */
const MESSAGES: Record<string, string> = {
  invalid_otp: 'That code is wrong or has expired.',
  otp_rate_limited: 'Please wait a minute before asking for another code.',
  invalid_credential: SESSION_ENDED,
  authentication_required: SESSION_ENDED,
  service_not_allowed: "This feature isn't turned on for your account.",
  chat_not_found: 'This chat no longer exists.',
  chat_busy: 'The last answer in this chat is still being written. Try again in a moment.',
  chat_not_active: 'This chat is closed. Start a new chat.',
  request_too_large: "That's too much to send at once. Remove some pages or photos.",
  daily_limit_reached: "You've used all of today's questions. Try again tomorrow.",
  rate_limited: "You're sending too fast. Wait a moment and try again.",
  idempotency_mismatch: 'This question was already sent. Open the chat again to see its answer.',
};

/** True when the login token is wrong, revoked or missing: the person must sign in again. */
export function isSessionError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === 'invalid_credential' || error.code === 'authentication_required')
  );
}

/**
 * True when a call made with the login token shows the session is over: the session codes,
 * or any 401. (A wrong sign-in code is a 401 too, but it is never sent with a token.)
 */
export function endsSession(error: unknown) {
  return isSessionError(error) || (error instanceof ApiError && error.status === 401);
}

/**
 * True when the same question may be sent again with the same Idempotency-Key: the answer
 * may still be coming, and a replay is never charged twice.
 */
export function isReplayable(error: unknown) {
  if (error instanceof TimeoutError || error instanceof NetworkError) return true;
  if (!(error instanceof ApiError)) return false;
  return error.status >= 500 || error.code === 'request_not_replayable';
}

/** A short message that is safe to show to the person. */
export function friendlyError(error: unknown): string {
  if (error instanceof NetworkError) return "Can't reach Sovrns. Check your internet connection.";
  if (error instanceof TimeoutError) return 'Sovrns is taking too long to answer. Try again.';
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';

  if (error.code === 'validation_error') {
    const field = error.details.map((detail) => detail.location[detail.location.length - 1]);
    if (field.includes('phone')) {
      return 'Enter your number with the country code, like +91 98765 43210.';
    }
  }
  return MESSAGES[error.code] ?? (error.message || 'Something went wrong. Try again.');
}
