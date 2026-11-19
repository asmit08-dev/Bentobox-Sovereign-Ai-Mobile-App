// The chat engine: send a message, stream the answer, stop, retry, regenerate.
// Screens call these functions. The engine updates the stores; the screens re-render.
import { AccessibilityInfo } from 'react-native';

import { NetworkError } from '@/api/client';
import type { ChatFinish } from '@/api/contract';
import { fetchTitle, streamChat } from '@/api/endpoints';
import { buildChatRequest } from '@/chat/request';
import type { AssistantMessage, Attachment, Message, UserMessage } from '@/chat/types';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { useChatsStore } from '@/stores/chats';
import { useLiveStore } from '@/stores/live';

// New words are shown in small groups, at most every 50ms, so long answers stay smooth.
const FLUSH_MS = 50;

const REFUSED_TEXT = "Sorry, I can't help with that request.";

/** The Stop button aborts this. Only one answer streams at a time. */
let currentAbort: AbortController | null = null;

function emptyAnswer(): AssistantMessage {
  return {
    id: newId(),
    role: 'assistant',
    text: '',
    images: [],
    status: 'streaming',
    createdAt: Date.now(),
  };
}

/** The first title of a chat, from its first message: "Plan a trip to Goa…". */
export function titleFrom(text: string, attachments: Attachment[]) {
  const words = text.trim().replace(/\s+/g, ' ');
  if (words) return words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
  const first = attachments[0];
  if (!first) return 'New chat';
  return first.kind === 'image' ? 'Photo' : first.name;
}

function findMessage(chatId: string, messageId: string): Message | undefined {
  return useChatsStore.getState().chats[chatId]?.messages.find((m) => m.id === messageId);
}

/**
 * Sends a message in the chat on screen, or starts a new chat.
 * Resolves with the finished answer (undefined if it could not be sent).
 */
export async function sendMessage(text: string, attachments: Attachment[]) {
  if (useLiveStore.getState().answer) return undefined;

  const store = useChatsStore.getState();
  const active = store.activeChatId;
  const chatId =
    active && store.chats[active] ? active : store.createChat(titleFrom(text, attachments));

  const user: UserMessage = {
    id: newId(),
    role: 'user',
    text: text.trim(),
    attachments,
    createdAt: Date.now(),
    status: 'sent',
  };
  const answer = emptyAnswer();
  useChatsStore.getState().appendMessages(chatId, [user, answer]);
  return runAnswer(chatId, answer.id);
}

/** Stops the answer that is streaming. The words so far are kept. */
export function stopAnswer() {
  if (!currentAbort) return;
  haptics.rigid();
  currentAbort.abort();
}

/** Asks again for an answer (Regenerate, or Retry after an error). It replaces the old one. */
export async function regenerateAnswer(chatId: string, answerId: string) {
  if (useLiveStore.getState().answer) return undefined;
  const message = findMessage(chatId, answerId);
  if (message?.role !== 'assistant') return undefined;
  useChatsStore.getState().updateMessage(chatId, answerId, () => ({
    ...emptyAnswer(),
    id: answerId,
    createdAt: message.createdAt,
  }));
  return runAnswer(chatId, answerId);
}

/** Sends a "Not sent" message again. */
export async function retrySend(chatId: string, userMessageId: string) {
  if (useLiveStore.getState().answer) return undefined;
  const message = findMessage(chatId, userMessageId);
  if (message?.role !== 'user') return undefined;
  const store = useChatsStore.getState();
  store.updateMessage(chatId, userMessageId, (m) => ({ ...m, status: 'sent' }) as UserMessage);
  const answer = emptyAnswer();
  store.appendMessages(chatId, [answer]);
  return runAnswer(chatId, answer.id);
}

/** Saves 👍 / 👎 on an answer. Tapping the same one again clears it. */
export function setFeedback(chatId: string, answerId: string, feedback: 'up' | 'down') {
  useChatsStore
    .getState()
    .updateMessage(chatId, answerId, (message) =>
      message.role === 'assistant'
        ? { ...message, feedback: message.feedback === feedback ? undefined : feedback }
        : message,
    );
  // TODO(api): send feedback to the real backend when it has an endpoint for it.
}

type Outcome =
  | { kind: 'done'; finish: ChatFinish }
  | { kind: 'stopped' }
  | { kind: 'error'; message: string }
  | { kind: 'not_sent' };

async function runAnswer(chatId: string, answerId: string) {
  const chat = useChatsStore.getState().chats[chatId];
  const index = chat?.messages.findIndex((message) => message.id === answerId) ?? -1;
  if (!chat || index === -1) return undefined;
  const history = chat.messages.slice(0, index);
  const asker = history[history.length - 1];

  const abort = new AbortController();
  currentAbort = abort;
  useLiveStore.getState().start(chatId, answerId);

  // Text arrives in many tiny pieces. Collect them and show them every FLUSH_MS.
  let pending = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending) useLiveStore.getState().appendText(pending);
    pending = '';
  };

  let outcome: Outcome;
  let started = false;
  let finish: ChatFinish | undefined;
  let serverError: string | undefined;

  try {
    const body = await buildChatRequest(history);
    await streamChat(body, {
      signal: abort.signal,
      onEvent: (event) => {
        started = true;
        switch (event.type) {
          case 'text':
            pending += event.delta;
            timer ??= setTimeout(flush, FLUSH_MS);
            break;
          case 'status':
            flush();
            if (event.status === 'creating_image') {
              useLiveStore.getState().setPhase('creating_image');
            }
            break;
          case 'image':
            flush();
            useLiveStore.getState().addImage(event.image);
            haptics.soft();
            break;
          case 'done':
            finish = event.finish;
            break;
          case 'error':
            serverError = event.message;
            break;
        }
      },
    });
    flush();
    if (serverError) outcome = { kind: 'error', message: serverError };
    else if (finish) outcome = { kind: 'done', finish };
    else outcome = { kind: 'error', message: 'The connection closed before the answer finished.' };
  } catch (error) {
    flush();
    if (abort.signal.aborted) outcome = { kind: 'stopped' };
    else if (error instanceof NetworkError && !started) outcome = { kind: 'not_sent' };
    else {
      outcome = {
        kind: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong.',
      };
    }
  }

  // Copy the live answer into the saved chat and clear the live store.
  const live = useLiveStore.getState().answer;
  const text = live?.messageId === answerId ? live.text : '';
  const images = live?.messageId === answerId ? live.images : [];
  useLiveStore.getState().clear();
  if (currentAbort === abort) currentAbort = null;

  const store = useChatsStore.getState();
  if (outcome.kind === 'not_sent') {
    store.removeMessage(chatId, answerId);
    if (asker?.role === 'user') {
      store.updateMessage(chatId, asker.id, (m) => ({ ...m, status: 'failed' }) as UserMessage);
    }
    haptics.error();
    return undefined;
  }

  let final: AssistantMessage = { ...emptyAnswer(), id: answerId, text, images };
  const empty = !text.trim() && images.length === 0;
  if (outcome.kind === 'done' && outcome.finish !== 'refused' && empty) {
    // Nothing to show (for example a picture that failed to draw). Offer Retry, not a blank turn.
    final = { ...final, status: 'error', note: 'The answer came back empty. Try again.' };
    haptics.error();
  } else if (outcome.kind === 'done') {
    if (outcome.finish === 'refused') {
      // A declined answer can stop halfway. Don't keep the half.
      final = { ...final, text: REFUSED_TEXT, images: [], status: 'done' };
    } else if (outcome.finish === 'length') {
      final = {
        ...final,
        status: 'done',
        note: 'The answer was cut short because it got too long.',
      };
    } else {
      final = { ...final, status: 'done' };
    }
  } else if (outcome.kind === 'stopped') {
    final = { ...final, status: 'stopped' };
  } else {
    final = { ...final, status: 'error', note: outcome.message };
    haptics.error();
  }

  store.updateMessage(chatId, answerId, (message) => ({
    ...final,
    createdAt: message.createdAt,
    feedback: undefined,
  }));

  if (final.status === 'done') {
    AccessibilityInfo.announceForAccessibility('Answer ready');
    void nameChat(chatId);
  }
  return final;
}

/** After the first answer, asks the backend for a better chat title. Fails quietly. */
async function nameChat(chatId: string) {
  const chat = useChatsStore.getState().chats[chatId];
  const [first, second] = chat?.messages ?? [];
  if (!chat || chat.messages.length !== 2) return;
  if (first?.role !== 'user' || second?.role !== 'assistant') return;
  // A picture-only answer is described by its pictures.
  const answer = second.text || second.images.map((image) => `[Image: ${image.alt}]`).join('\n');
  if (!answer) return;
  // Only replace the automatic title, never one the user typed.
  if (chat.title !== titleFrom(first.text, first.attachments)) return;
  try {
    const { title } = await fetchTitle({
      userText: first.text || first.attachments.map((file) => file.name).join(', '),
      assistantText: answer,
    });
    const now = useChatsStore.getState().chats[chatId];
    if (title && now && now.title === chat.title)
      useChatsStore.getState().renameChat(chatId, title);
  } catch {
    // Keep the automatic title.
  }
}
