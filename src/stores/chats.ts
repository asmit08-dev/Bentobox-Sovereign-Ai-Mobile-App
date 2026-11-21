// The phone's copy of the signed-in person's chats. The server has the real history
// (chat/sync.ts keeps this copy fresh); the copy lets chats open fast and show offline.
// It belongs to one account: Sign out or another account clears it (spec 5.2, 5.3).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import type { ChatSummary } from '@/api/types';
import { applyChatPage as withPage, linkServer as withLink } from '@/chat/chatList';
import { mergeAnswered as withoutCopies, settleWaiting } from '@/chat/mapping';
import { deleteAllPendingBodies, deletePendingBody } from '@/chat/pendingBodies';
import type { Attachment, Chat, Message } from '@/chat/types';
import { deleteAllAttachments } from '@/lib/files';
import { newId } from '@/lib/id';
import { createFileStorage } from '@/lib/storage';
import { onAccountChange } from '@/stores/auth';
import { deleteAttachmentFiles, useComposerStore } from '@/stores/composer';

type ChatsState = {
  chats: Record<string, Chat>;
  /** The server's chats, in the server's order (newest activity first), as far as loaded. */
  order: string[];
  /** Pass to the server for the next page of the list. Not saved. */
  nextCursor: string | null;
  /** Whose chats these are. */
  accountId: string | null;
  /** The chat on screen. null means a new, empty chat. Not saved: the app opens on a new chat. */
  activeChatId: string | null;
  /** True once saved chats have been loaded. */
  hydrated: boolean;

  /** Creates an empty chat on this phone, makes it active, and returns its id. */
  createChat: (title: string) => string;
  openChat: (chatId: string | null) => void;
  appendMessages: (chatId: string, messages: Message[]) => void;
  updateMessage: (chatId: string, messageId: string, update: (message: Message) => Message) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  updateChat: (chatId: string, patch: Partial<Omit<Chat, 'id' | 'messages'>>) => void;
  /** Changes the title on this phone only (the drawer also tells the server). */
  renameChat: (chatId: string, title: string) => void;
  /**
   * Removes a chat and its files from this phone only (chat/manage.ts also tells the server).
   * `keepFiles` leaves its photos in place, so a delete the server refuses can be undone.
   */
  deleteChat: (chatId: string, options?: { keepFiles?: boolean }) => void;
  /** Puts a chat back (a delete the server refused). */
  restoreChat: (chat: Chat, orderIndex: number) => void;
  /** The server knows this chat now. */
  linkServer: (chatId: string, serverId: string) => void;
  /** A page of the server's chat list. `reset` for the first page. */
  applyChatPage: (items: ChatSummary[], nextCursor: string | null, reset: boolean) => void;
  /** Keeps the photos of an answered question by its request id (see Chat.attachmentsByRequest). */
  rememberAttachments: (chatId: string, requestId: string, attachments: Attachment[]) => void;
  /** A question sent again got its answer: copies of it shown from the server go. */
  mergeAnswered: (chatId: string, userId: string, answerId: string, requestId: string) => void;
  /** Polling ended while the server was still writing: the waiting dots become `note`. */
  stopWaiting: (chatId: string, note: string) => void;
  replaceMessages: (
    chatId: string,
    messages: Message[],
    meta: { olderBefore: number | null; canContinue?: boolean; title?: string },
  ) => void;
  prependMessages: (chatId: string, messages: Message[], olderBefore: number | null) => void;
  /** After a sign-in: a different account's chats are cleared first. */
  setAccount: (accountId: string) => void;
  /** Clears every chat and attachment file (Sign out). */
  wipe: () => void;
};

function touch(chat: Chat, messages: Message[]): Chat {
  return { ...chat, messages, updatedAt: Date.now() };
}

/**
 * Deletes what a chat saved on this phone: the photos and page pictures of its questions
 * (loaded or kept by request id) and the saved bodies of questions still waiting.
 */
export function deleteChatFiles(chat: Chat) {
  const attachments = new Map<string, Attachment>();
  for (const message of chat.messages) {
    if (message.role !== 'user') continue;
    for (const attachment of message.attachments) attachments.set(attachment.path, attachment);
    if (message.idempotencyKey) void deletePendingBody(message.idempotencyKey);
  }
  for (const kept of Object.values(chat.attachmentsByRequest ?? {})) {
    for (const attachment of kept) attachments.set(attachment.path, attachment);
  }
  for (const attachment of attachments.values()) deleteAttachmentFiles(attachment);
}

const EMPTY = { chats: {}, order: [], nextCursor: null, activeChatId: null };

export const useChatsStore = create<ChatsState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      accountId: null,
      hydrated: false,

      createChat: (title) => {
        const id = newId();
        const now = Date.now();
        set((state) => ({
          chats: {
            ...state.chats,
            [id]: { id, title, createdAt: now, updatedAt: now, messages: [], canContinue: true },
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
          return { chats: { ...state.chats, [chatId]: { ...chat, messages } } };
        }),

      removeMessage: (chatId, messageId) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          const messages = chat.messages.filter((message) => message.id !== messageId);
          return { chats: { ...state.chats, [chatId]: { ...chat, messages } } };
        }),

      updateChat: (chatId, patch) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return { chats: { ...state.chats, [chatId]: { ...chat, ...patch } } };
        }),

      renameChat: (chatId, title) => get().updateChat(chatId, { title }),

      deleteChat: (chatId, options) => {
        const chat = get().chats[chatId];
        if (!chat) return;
        if (!options?.keepFiles) deleteChatFiles(chat);
        set((state) => {
          const { [chatId]: _removed, ...rest } = state.chats;
          return {
            chats: rest,
            order: state.order.filter((id) => id !== chatId),
            activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
          };
        });
      },

      restoreChat: (chat, orderIndex) =>
        set((state) => {
          const order = state.order.filter((id) => id !== chat.id);
          if (chat.serverId && orderIndex >= 0) order.splice(orderIndex, 0, chat.id);
          return { chats: { ...state.chats, [chat.id]: chat }, order };
        }),

      // Both keep one chat per server chat (chat/chatList.ts, tested in Node).
      linkServer: (chatId, serverId) => set((state) => withLink(state, chatId, serverId)),

      applyChatPage: (items, nextCursor, reset) =>
        set((state) => withPage(state, items, nextCursor, reset)),

      rememberAttachments: (chatId, requestId, attachments) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat || attachments.length === 0) return state;
          const attachmentsByRequest = { ...chat.attachmentsByRequest, [requestId]: attachments };
          return { chats: { ...state.chats, [chatId]: { ...chat, attachmentsByRequest } } };
        }),

      mergeAnswered: (chatId, userId, answerId, requestId) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          const messages = withoutCopies(chat.messages, userId, answerId, requestId);
          if (messages === chat.messages) return state;
          return { chats: { ...state.chats, [chatId]: { ...chat, messages } } };
        }),

      stopWaiting: (chatId, note) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          const messages = chat.messages.map((message): Message =>
            message.role === 'assistant' &&
            message.status === 'waiting' &&
            message.id.startsWith('pending-')
              ? { ...message, status: 'done', text: '', note }
              : message,
          );
          return { chats: { ...state.chats, [chatId]: { ...chat, messages } } };
        }),

      replaceMessages: (chatId, messages, meta) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return {
            chats: {
              ...state.chats,
              [chatId]: {
                ...chat,
                messages,
                olderBefore: meta.olderBefore,
                canContinue: meta.canContinue ?? chat.canContinue,
                title: meta.title || chat.title,
                synced: true,
              },
            },
          };
        }),

      prependMessages: (chatId, messages, olderBefore) =>
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          const known = new Set(chat.messages.map((message) => message.id));
          const older = messages.filter((message) => !known.has(message.id));
          return {
            chats: {
              ...state.chats,
              [chatId]: { ...chat, messages: [...older, ...chat.messages], olderBefore },
            },
          };
        }),

      setAccount: (accountId) => {
        const current = get().accountId;
        if (current && current !== accountId) get().wipe();
        set({ accountId });
      },

      wipe: () => {
        deleteAllAttachments();
        deleteAllPendingBodies();
        set({ ...EMPTY, accountId: null });
      },
    }),
    {
      name: 'sovrns-chats',
      version: 2,
      storage: createJSONStorage(createFileStorage),
      partialize: (state) => ({
        chats: state.chats,
        order: state.order,
        accountId: state.accountId,
      }),
      // Version 1 held the test AI's chats, which don't exist on the server. Start clean.
      migrate: (persisted, version) => {
        if (version < 2) {
          deleteAllAttachments();
          return { chats: {}, order: [], accountId: null };
        }
        return persisted as Pick<ChatsState, 'chats' | 'order' | 'accountId'>;
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<Pick<ChatsState, 'chats' | 'order' | 'accountId'>>;
        return {
          ...current,
          // Keep chats made before loading finished (rare), and settle answers that were waiting.
          chats: { ...settleWaiting(saved?.chats ?? {}), ...current.chats },
          order: saved?.order ?? current.order,
          accountId: saved?.accountId ?? current.accountId,
        };
      },
    },
  ),
);

// Loading can finish before this line (web storage is instant) or later (files on phones).
useChatsStore.persist.onFinishHydration(() => useChatsStore.setState({ hydrated: true }));
if (useChatsStore.persist.hasHydrated()) useChatsStore.setState({ hydrated: true });

// Sign out clears everything; a sign-in by another account clears the old account's chats.
onAccountChange((accountId) => {
  if (accountId === null) {
    useChatsStore.getState().wipe();
    useComposerStore.getState().clear();
  } else {
    useChatsStore.getState().setAccount(accountId);
  }
});

/** The chat on screen, or undefined for a new chat. */
export function useActiveChat() {
  return useChatsStore((state) =>
    state.activeChatId ? state.chats[state.activeChatId] : undefined,
  );
}

/**
 * The chats for the history drawer: chats only on this phone (waiting for their first answer)
 * first, then the server's chats in the server's order.
 */
export function useDrawerChats() {
  return useChatsStore(
    useShallow((state) => {
      const listed = new Set(state.order);
      const local = Object.values(state.chats)
        .filter((chat) => !chat.serverId && !listed.has(chat.id) && chat.messages.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const server = state.order.flatMap((id) => (state.chats[id] ? [state.chats[id]] : []));
      return [...local, ...server];
    }),
  );
}
