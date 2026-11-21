// Rename and delete a chat. The change shows on the phone at once, then the server is told.
// If the server refuses, the change is undone and the error is thrown for the screen to show
// (spec 5.3).
import { ApiError } from '@/api/http';
import * as api from '@/api/sovrns';
import { authed } from '@/stores/auth';
import { deleteChatFiles, useChatsStore } from '@/stores/chats';

/** Gives a chat a new title (1–120 characters). */
export async function renameChat(chatId: string, title: string) {
  const chat = useChatsStore.getState().chats[chatId];
  if (!chat) return;
  const before = chat.title;
  useChatsStore.getState().renameChat(chatId, title);
  // A chat waiting for its first answer isn't on the server yet: the title stays on the phone.
  const serverId = chat.serverId;
  if (!serverId) return;
  try {
    const saved = await authed((token) => api.renameChat(token, serverId, title));
    useChatsStore.getState().renameChat(chatId, saved.title || title);
  } catch (error) {
    useChatsStore.getState().renameChat(chatId, before);
    throw error;
  }
}

/** Deletes a chat on the server and on this phone (its photos too). */
export async function deleteChat(chatId: string) {
  const store = useChatsStore.getState();
  const chat = store.chats[chatId];
  if (!chat) return;
  const orderIndex = store.order.indexOf(chatId);
  // The photos stay until the server agrees, so a refused delete can be undone.
  store.deleteChat(chatId, { keepFiles: true });
  const serverId = chat.serverId;
  if (serverId) {
    try {
      await authed((token) => api.deleteChat(token, serverId));
    } catch (error) {
      // Already gone from the server: the delete is done.
      if (!(error instanceof ApiError && error.code === 'chat_not_found')) {
        useChatsStore.getState().restoreChat(chat, orderIndex);
        throw error;
      }
    }
  }
  deleteChatFiles(chat);
}
