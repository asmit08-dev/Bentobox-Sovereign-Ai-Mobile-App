// Keeps the phone's copy of the chats in step with the server (spec 5.3).
import { isSessionError } from '@/api/errors';
import { ApiError } from '@/api/http';
import * as api from '@/api/sovrns';
import { hasPendingAnswer, messagesFromServer } from '@/chat/mapping';
import { createPoller } from '@/chat/poller';
import { authed } from '@/stores/auth';
import { useChatsStore } from '@/stores/chats';
import { useLiveStore } from '@/stores/live';

const CHATS_PER_PAGE = 30;
const MESSAGES_PER_PAGE = 50;
// While the server is still answering a question, look again this often, for at most this long.
const POLL_EVERY_MS = 4_000;
const POLL_FOR_MS = 120_000;

const STILL_WRITING = 'The answer is taking a while. Open this chat again later to see it.';

let refreshing: Promise<void> | null = null;
let loadingMore = false;

/** Gets the first page of the chat list. Calls made while one is running share it. */
export function refreshChats() {
  refreshing ??= (async () => {
    try {
      const page = await authed((token) => api.listChats(token, { limit: CHATS_PER_PAGE }));
      useChatsStore.getState().applyChatPage(page.items, page.next_cursor, true);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Gets the next page of the chat list, if there is one. */
export async function loadMoreChats() {
  const cursor = useChatsStore.getState().nextCursor;
  if (!cursor || loadingMore) return;
  loadingMore = true;
  try {
    const page = await authed((token) => api.listChats(token, { limit: CHATS_PER_PAGE, cursor }));
    useChatsStore.getState().applyChatPage(page.items, page.next_cursor, false);
  } finally {
    loadingMore = false;
  }
}

function isAnswering(chatId: string) {
  return useLiveStore.getState().answer?.chatId === chatId;
}

/**
 * Gets the newest messages of a chat once and puts them in place of the phone's copy (photos
 * sent from this phone and unsent questions are kept). Resolves true while the server is still
 * answering. A chat the server no longer has is removed from this phone.
 */
async function syncChatOnce(chatId: string) {
  const chat = useChatsStore.getState().chats[chatId];
  const serverId = chat?.serverId;
  // A question on its way updates this chat itself when its answer arrives.
  if (!serverId || isAnswering(chatId)) return false;
  try {
    const result = await authed((token) =>
      api.listMessages(token, serverId, { limit: MESSAGES_PER_PAGE }),
    );
    const current = useChatsStore.getState().chats[chatId];
    if (!current || isAnswering(chatId)) return false;
    const messages = messagesFromServer(
      result.items,
      current.messages,
      current.attachmentsByRequest,
    );
    useChatsStore.getState().replaceMessages(chatId, messages, {
      olderBefore: result.next_before,
      canContinue: result.chat?.can_continue,
      title: result.chat?.title,
    });
    return hasPendingAnswer(result.items);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'chat_not_found') {
      useChatsStore.getState().deleteChat(chatId);
    }
    throw error;
  }
}

// While the server is still answering, the open chat is looked at again every few seconds,
// for at most 2 minutes. Then the dots become a note (chat/poller.ts, tested in Node).
const poller = createPoller({
  everyMs: POLL_EVERY_MS,
  forMs: POLL_FOR_MS,
  isOpen: (chatId) => useChatsStore.getState().activeChatId === chatId,
  look: async (chatId) => {
    try {
      return await syncChatOnce(chatId);
    } catch (error) {
      // Signed out, or the chat is gone: stop looking.
      if (isSessionError(error)) return false;
      if (error instanceof ApiError && error.code === 'chat_not_found') return false;
      throw error;
    }
  },
  giveUp: (chatId) => useChatsStore.getState().stopWaiting(chatId, STILL_WRITING),
});

/** Gets the newest messages of a chat, and keeps looking while the server is still answering. */
export async function syncChat(chatId: string) {
  const waiting = await syncChatOnce(chatId);
  if (waiting) poller.schedule(chatId);
  else poller.stop(chatId);
}

/** Gets the messages before the oldest one shown. */
export async function loadOlderMessages(chatId: string) {
  const chat = useChatsStore.getState().chats[chatId];
  if (!chat?.serverId || chat.olderBefore == null) return;
  const serverId = chat.serverId;
  const before = chat.olderBefore;
  const result = await authed((token) =>
    api.listMessages(token, serverId, { limit: MESSAGES_PER_PAGE, before }),
  );
  const current = useChatsStore.getState().chats[chatId];
  if (!current) return;
  // Only questions the server knows can match; unsent ones already sit at the end.
  const known = current.messages.filter((message) => message.role === 'user' && message.requestId);
  const older = messagesFromServer(result.items, known, current.attachmentsByRequest).filter(
    (message) => message.role === 'user' || message.status !== 'waiting',
  );
  useChatsStore.getState().prependMessages(chatId, older, result.next_before);
}
