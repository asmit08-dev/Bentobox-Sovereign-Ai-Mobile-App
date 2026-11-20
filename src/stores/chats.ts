// All chats, saved on the phone. The answer that is still streaming lives in
// stores/live.ts and is copied here once it ends, so typing fast never means
// writing the whole file many times a second.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Chat, Message } from '@/chat/types';
import { deleteFile } from '@/lib/files';
import { newId } from '@/lib/id';
import { createFileStorage } from '@/lib/storage';

type ChatsState = {
  chats: Record<string, Chat>;
  /** The chat on screen. null means a new, empty chat. Not saved: the app opens on a new chat. */
  activeChatId: string | null;
  /** True once saved chats have been loaded. */
  hydrated: boolean;

  /** Creates an empty chat, makes it active, and returns its id. */
  createChat: (title: string) => string;
  openChat: (chatId: string | null) => void;
  appendMessages: (chatId: string, messages: Message[]) => void;
  updateMessage: (chatId: string, messageId: string, update: (message: Message) => Message) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  renameChat: (chatId: string, title: string) => void;
  deleteChat: (chatId: string) => void;
};

function touch(chat: Chat, messages: Message[]): Chat {
  return { ...chat, messages, updatedAt: Date.now() };
}

/** An answer that was streaming when the app closed can never finish. Mark it stopped. */
function settleUnfinished(chats: Record<string, Chat>) {
  const settled: Record<string, Chat> = {};
  for (const [id, chat] of Object.entries(chats)) {
    settled[id] = {
      ...chat,
      messages: chat.messages.map((message) =>
        message.role === 'assistant' && message.status === 'streaming'
          ? { ...message, status: 'stopped' }
          : message,
      ),
    };
  }
  return settled;
}

export const useChatsStore = create<ChatsState>()(
  persist(
    (set, get) => ({
      chats: {},
      activeChatId: null,
      hydrated: false,

      createChat: (title) => {
        const id = newId();
        const now = Date.now();
        set((state) => ({
          chats: {
            ...state.chats,
            [id]: { id, title, createdAt: now, updatedAt: now, messages: [] },
          },
          activeChatId: id,
        }));
        return id;
      },

      openChat: (chatId) => set({ activeChatId: chatId }),

      appendMessages: (chatId, messages) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return {
            chats: { ...state.chats, [chatId]: touch(chat, [...chat.messages, ...messages]) },
          };
        }),

      updateMessage: (chatId, messageId, update) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          const messages = chat.messages.map((message) =>
            message.id === messageId ? update(message) : message,
          );
          return { chats: { ...state.chats, [chatId]: touch(chat, messages) } };
        }),

      removeMessage: (chatId, messageId) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          const messages = chat.messages.filter((message) => message.id !== messageId);
          return { chats: { ...state.chats, [chatId]: touch(chat, messages) } };
        }),

      renameChat: (chatId, title) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return { chats: { ...state.chats, [chatId]: { ...chat, title } } };
        }),

      deleteChat: (chatId) => {
        const chat = get().chats[chatId];
        if (!chat) return;
        for (const message of chat.messages) {
          if (message.role === 'user') {
            for (const attachment of message.attachments) deleteFile(attachment.path);
          }
        }
        set((state) => {
          const { [chatId]: _removed, ...rest } = state.chats;
          return {
            chats: rest,
            activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
          };
        });
      },
    }),
    {
      name: 'sovrns-chats',
      version: 1,
      storage: createJSONStorage(createFileStorage),
      // Only the chats are saved.
      partialize: (state) => ({ chats: state.chats }),
      merge: (persisted, current) => {
        const saved = (persisted as { chats?: Record<string, Chat> } | undefined)?.chats ?? {};
        // Keep chats made before loading finished (rare, but never lose them).
        return { ...current, chats: { ...settleUnfinished(saved), ...current.chats } };
      },
    },
  ),
);

// Loading can finish before this line (web storage is instant) or later (files on phones).
// Both cases end with `hydrated: true`.
useChatsStore.persist.onFinishHydration(() => useChatsStore.setState({ hydrated: true }));
if (useChatsStore.persist.hasHydrated()) useChatsStore.setState({ hydrated: true });

/** The chat on screen, or undefined for a new chat. */
export function useActiveChat() {
  return useChatsStore((state) =>
    state.activeChatId ? state.chats[state.activeChatId] : undefined,
  );
}
