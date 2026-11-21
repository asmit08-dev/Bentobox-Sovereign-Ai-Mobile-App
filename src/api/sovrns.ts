// One function per Sovrns API endpoint. Screens and stores import this file as a namespace:
//   import * as api from '@/api/sovrns';
// No React Native imports here: Node runs the live API test against this file.
import { apiRequest } from './http';
import type {
  AskBody,
  AskResponse,
  ChatListResponse,
  ChatSummary,
  MessagesResponse,
  OtpChallenge,
  SessionInfo,
  VerifyResponse,
} from './types';

/** Adds the query string, leaving out empty values: "/x?limit=20". */
function withQuery(path: string, query: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== '') params.set(name, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

// ---------- Sign-in ----------

/** Sends a sign-in code by SMS. `phone` is E.164, for example "+919876543210". */
export function requestCode(phone: string) {
  return apiRequest<OtpChallenge>({
    path: '/api/v1/auth/otp/request',
    method: 'POST',
    body: { phone },
  });
}

/** Checks the code. Returns the login token and who is signed in. */
export function verifyCode(input: { challengeId: string; code: string; deviceName?: string }) {
  return apiRequest<VerifyResponse>({
    path: '/api/v1/auth/otp/verify',
    method: 'POST',
    body: { challenge_id: input.challengeId, code: input.code, device_name: input.deviceName },
  });
}

/** Who is signed in, what they may send, and today's question allowance. */
export function getMe(token: string) {
  return apiRequest<SessionInfo>({ path: '/api/v1/me', token });
}

/** Ends this login token on the server. */
export async function logout(token: string) {
  await apiRequest<unknown>({ path: '/api/v1/auth/logout', method: 'POST', token });
}

// ---------- Asking ----------

/**
 * Asks a question: text, pictures, or a voice recording. Without `chat_id` it starts a new chat.
 * `body` may be a saved JSON string, so a cut-off question can be sent again byte for byte.
 */
/** CloudFront gives up after 60 s; a question gets a little longer before the phone does. */
export const ASK_TIMEOUT_MS = 65_000;

export function ask(
  token: string,
  body: AskBody | string,
  options: { idempotencyKey: string; signal?: AbortSignal; timeoutMs?: number },
) {
  return apiRequest<AskResponse>({
    path: '/ask',
    method: 'POST',
    body,
    token,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? ASK_TIMEOUT_MS,
  });
}

// ---------- Chat history ----------

/** Chats, newest activity first. Pass `next_cursor` back as `cursor` for the next page. */
export function listChats(token: string, options: { limit?: number; cursor?: string | null } = {}) {
  return apiRequest<ChatListResponse>({
    path: withQuery('/api/v1/chats', { limit: options.limit, cursor: options.cursor }),
    token,
  });
}

/** The newest messages of one chat (oldest → newest). Pass `next_before` back as `before`. */
export function listMessages(
  token: string,
  chatId: string,
  options: { limit?: number; before?: number | null } = {},
) {
  return apiRequest<MessagesResponse>({
    path: withQuery(`/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
      limit: options.limit,
      before: options.before,
    }),
    token,
  });
}

/** Renames a chat. The title must be 1–120 characters. */
export function renameChat(token: string, chatId: string, title: string) {
  return apiRequest<Pick<ChatSummary, 'id' | 'title' | 'can_continue' | 'last_activity_at'>>({
    path: `/api/v1/chats/${encodeURIComponent(chatId)}`,
    method: 'PATCH',
    body: { title },
    token,
  });
}

/** Removes a chat from the list. */
export async function deleteChat(token: string, chatId: string) {
  await apiRequest<unknown>({
    path: `/api/v1/chats/${encodeURIComponent(chatId)}`,
    method: 'DELETE',
    token,
  });
}
