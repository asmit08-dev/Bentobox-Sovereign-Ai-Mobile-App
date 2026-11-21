// Turning the server's chats and messages into the app's, without losing what only this phone
// has (photos it sent, questions that never reached the server).
// No React Native imports: Node tests this file.
import type { ChatSummary, ServerMessage } from '../api/types';
import type { AssistantMessage, Attachment, Chat, Message, UserMessage } from './types';

const FINISHED = new Set(['succeeded', 'failed']);
const NOT_ANSWERED = "This question wasn't answered.";
const UNAVAILABLE = 'This message is no longer available.';

function timeOf(iso: string | null | undefined, fallback: number) {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? time : fallback;
}

/** A chat from the server's list. An existing chat keeps its local id and its messages. */
export function chatFromSummary(summary: ChatSummary, existing?: Chat): Chat {
  const updatedAt = timeOf(summary.last_activity_at, existing?.updatedAt ?? Date.now());
  return {
    id: existing?.id ?? summary.id,
    serverId: summary.id,
    title: summary.title || existing?.title || 'New chat',
    createdAt: existing?.createdAt ?? timeOf(summary.created_at, updatedAt),
    updatedAt,
    messages: existing?.messages ?? [],
    canContinue: summary.can_continue,
    preview: summary.last_message_preview ?? existing?.preview,
    olderBefore: existing?.olderBefore,
    synced: existing?.synced,
  };
}

/** True when the newest message is a question the server is still answering. */
export function hasPendingAnswer(items: ServerMessage[]) {
  const last = items[items.length - 1];
  return last?.role === 'user' && last.request_status != null && !FINISHED.has(last.request_status);
}

function fromServerUser(
  item: ServerMessage,
  mine: UserMessage | undefined,
  saved: Attachment[] | undefined,
): UserMessage {
  return {
    id: item.id,
    role: 'user',
    text: item.text ?? '',
    // The server never sends files back; photos sent from this phone are kept.
    attachments: mine?.attachments ?? saved ?? [],
    attachmentCount: item.attachment_count,
    createdAt: timeOf(item.created_at, Date.now()),
    status: 'sent',
    requestId: item.request_id ?? undefined,
    voice: mine?.voice,
  };
}

function fromServerAnswer(item: ServerMessage): AssistantMessage {
  const failed = item.request_status === 'failed';
  const missing = item.text == null && item.unavailable != null;
  return {
    id: item.id,
    role: 'assistant',
    text: item.text ?? '',
    status: failed ? 'error' : 'done',
    note: failed ? NOT_ANSWERED : missing ? UNAVAILABLE : undefined,
    createdAt: timeOf(item.created_at, Date.now()),
    requestId: item.request_id ?? undefined,
  };
}

/**
 * The server's messages (oldest first) → the app's. Photos this phone sent are matched by
 * request id: from the loaded messages, or from the chat's saved list (`saved`, for questions
 * that are no longer loaded). Questions that never reached the server (and the answer that is
 * waiting for one) stay at the end. While the server is still answering, a waiting answer is
 * added.
 */
export function messagesFromServer(
  items: ServerMessage[],
  local: Message[],
  saved: Record<string, Attachment[]> = {},
): Message[] {
  const mineByRequest = new Map<string, UserMessage>();
  for (const message of local) {
    if (message.role === 'user' && message.requestId) {
      mineByRequest.set(message.requestId, message);
    }
  }

  const result: Message[] = items.map((item) =>
    item.role === 'user'
      ? fromServerUser(
          item,
          item.request_id ? mineByRequest.get(item.request_id) : undefined,
          item.request_id ? saved[item.request_id] : undefined,
        )
      : fromServerAnswer(item),
  );

  if (hasPendingAnswer(items)) {
    const last = items[items.length - 1];
    result.push({
      id: `pending-${last.request_id ?? last.id}`,
      role: 'assistant',
      text: '',
      status: 'waiting',
      createdAt: Date.now(),
      requestId: last.request_id ?? undefined,
    });
  }

  // Only on this phone: questions without a request id, and the answer waiting right after one.
  let keptQuestion = false;
  for (const message of local) {
    if (message.role === 'user') {
      keptQuestion = !message.requestId;
      if (keptQuestion) result.push(message);
    } else if (keptQuestion && message.status === 'waiting') {
      result.push(message);
    }
  }
  return result;
}

/**
 * A question sent again got its answer (request `requestId`). If a sync already showed that
 * question from the server (without its photos), the server's copies go and the phone's
 * question and answer stay, so it isn't shown twice.
 */
export function mergeAnswered(
  messages: Message[],
  userId: string,
  answerId: string,
  requestId: string,
) {
  const copies = messages.filter(
    (message) =>
      message.id !== userId && message.id !== answerId && message.requestId === requestId,
  );
  if (copies.length === 0) return messages;
  return messages.filter((message) => !copies.includes(message));
}

/**
 * After a restart, no answer can still be on its way. A waiting answer is removed; its question
 * becomes "Not sent · Tap to retry", unless the server already has it (the next sync shows it).
 */
export function settleWaiting(chats: Record<string, Chat>): Record<string, Chat> {
  const settled: Record<string, Chat> = {};
  for (const [id, chat] of Object.entries(chats)) {
    if (!chat.messages.some((m) => m.role === 'assistant' && m.status === 'waiting')) {
      settled[id] = chat;
      continue;
    }
    const messages: Message[] = [];
    for (const message of chat.messages) {
      if (message.role === 'assistant' && message.status === 'waiting') {
        const previous = messages[messages.length - 1];
        if (previous?.role === 'user' && !previous.requestId) {
          messages[messages.length - 1] = { ...previous, status: 'failed' };
        }
        continue;
      }
      messages.push(message);
    }
    settled[id] = { ...chat, messages };
  }
  return settled;
}
