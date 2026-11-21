// The chat list: the server's chats in the server's order, merged with the phone's copy.
// No React Native imports: Node tests this file.
import type { ChatSummary } from '../api/types';
import { chatFromSummary } from './mapping';
import type { Chat } from './types';

export type ChatList = {
  chats: Record<string, Chat>;
  order: string[];
  activeChatId: string | null;
  nextCursor: string | null;
};

/** Chats by server id. When two share one, the one with more messages is the real one. */
function byServerId(chats: Record<string, Chat>) {
  const found = new Map<string, Chat>();
  for (const chat of Object.values(chats)) {
    if (!chat.serverId) continue;
    const other = found.get(chat.serverId);
    if (!other || chat.messages.length > other.messages.length) found.set(chat.serverId, chat);
  }
  return found;
}

/**
 * The server now knows the phone's chat `chatId` as `serverId`. If the list already holds a
 * copy of that server chat (listed before the first answer arrived, for example after a
 * restart), the copy goes and the phone's chat takes its place: it stays one chat.
 */
export function linkServer(
  state: ChatList,
  chatId: string,
  serverId: string,
): Pick<ChatList, 'chats' | 'order' | 'activeChatId'> {
  const chat = state.chats[chatId];
  if (!chat) return { chats: state.chats, order: state.order, activeChatId: state.activeChatId };
  const copies = new Set(
    Object.values(state.chats)
      .filter((other) => other.id !== chatId && other.serverId === serverId)
      .map((other) => other.id),
  );
  const chats = { ...state.chats, [chatId]: { ...chat, serverId } };
  for (const id of copies) delete chats[id];
  const swapped = state.order.map((id) => (copies.has(id) ? chatId : id));
  let order = swapped.filter((id, index) => swapped.indexOf(id) === index);
  // It stays at the top of the list until the next refresh puts it in place.
  if (!order.includes(chatId)) order = [chatId, ...order];
  const activeChatId =
    state.activeChatId && copies.has(state.activeChatId) ? chatId : state.activeChatId;
  return { chats, order, activeChatId };
}

/**
 * A page of the server's chat list (`reset` for the first page). Titles, times, previews and
 * `canContinue` are updated. Nothing is deleted on a guess: a cached chat missing from this
 * page just isn't listed. A stray second copy of a server chat is dropped.
 */
export function applyChatPage(
  state: ChatList,
  items: ChatSummary[],
  nextCursor: string | null,
  reset: boolean,
): Pick<ChatList, 'chats' | 'order' | 'nextCursor' | 'activeChatId'> {
  const chats = { ...state.chats };
  const known = byServerId(chats);
  const movedTo = new Map<string, string>();
  for (const chat of Object.values(chats)) {
    const real = chat.serverId ? known.get(chat.serverId) : undefined;
    if (real && real !== chat) {
      delete chats[chat.id];
      movedTo.set(chat.id, real.id);
    }
  }
  const ids: string[] = [];
  for (const item of items) {
    const chat = chatFromSummary(item, known.get(item.id));
    chats[chat.id] = chat;
    ids.push(chat.id);
  }
  const kept = state.order
    .map((id) => movedTo.get(id) ?? id)
    .filter((id, index, all) => chats[id] && all.indexOf(id) === index);
  const order = reset ? ids : [...kept, ...ids.filter((id) => !kept.includes(id))];
  const active = state.activeChatId;
  const activeChatId = active ? (movedTo.get(active) ?? active) : null;
  return { chats, order, nextCursor, activeChatId };
}
