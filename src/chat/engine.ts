// The chat engine: ask a question (text, pictures or voice), get the answer, retry.
// Screens call these functions. The engine updates the stores; the screens re-render.
//
// One POST /ask per question (the answer comes back whole, not word by word). Every question has
// an Idempotency-Key, and its exact body is saved until the answer arrives: if the answer is cut
// off on the way back, the same body goes out again with the same key and the server returns the
// answer it already made, charged once (spec 5.4).
import { AccessibilityInfo } from 'react-native';

import { friendlyError, isReplayable, isSessionError } from '@/api/errors';
import { ApiError } from '@/api/http';
import * as api from '@/api/sovrns';
import type { AskAudio, VoiceReply } from '@/api/types';
import { buildAskBody } from '@/chat/askBody';
import { prepareImagesForSend } from '@/chat/images';
import { canStartOver } from '@/chat/keyRule';
import { deletePendingBody, loadPendingBody, savePendingBody } from '@/chat/pendingBodies';
import { askWithReplay } from '@/chat/replay';
import { refreshChats } from '@/chat/sync';
import type { AssistantMessage, Attachment, UserMessage } from '@/chat/types';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { authed, useAuthStore } from '@/stores/auth';
import { useChatsStore } from '@/stores/chats';
import { useLiveStore } from '@/stores/live';

const DEFAULT_PAGES_MAX = 50;
const DEFAULT_IMAGE_BYTES = 4_194_304;
const INCOMPLETE = 'This answer may be incomplete.';
const VOICE_GONE = "This voice message can't be sent again. Tap the mic and ask again.";

type AskResult = { answer?: AssistantMessage; voiceReply: VoiceReply | null };
type VoiceInput = { audio: AskAudio; replyAsVoice: boolean };

/** The first title of a chat, from its first message: "Plan a trip to Goa…". */
export function titleFrom(text: string, attachments: Attachment[]) {
  const words = text.trim().replace(/\s+/g, ' ');
  if (words) return words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
  const first = attachments[0];
  if (!first) return 'New chat';
  return first.kind === 'image' ? 'Photo' : first.name;
}

function waitingAnswer(): AssistantMessage {
  return { id: newId(), role: 'assistant', text: '', status: 'waiting', createdAt: Date.now() };
}

function findUser(chatId: string, userId: string) {
  const message = useChatsStore
    .getState()
    .chats[chatId]?.messages.find((entry) => entry.id === userId);
  return message?.role === 'user' ? message : undefined;
}

function droppedNote(sent: number) {
  return `Only the first ${sent} pages fit in one question. Ask again with the rest.`;
}

/**
 * The body for a question, saved under its key. A saved body is reused byte for byte; it also
 * means this key was sent before (`reused`).
 */
async function bodyFor(chatId: string, user: UserMessage, key: string, voice?: VoiceInput) {
  const saved = await loadPendingBody(key);
  if (saved) return { json: saved, note: undefined, reused: true };
  // A voice question's recording is gone once sent; only its saved body can go again.
  if (user.voice && !voice) throw new Error(VOICE_GONE);

  const features = useAuthStore.getState().features;
  const { images, dropped } = await prepareImagesForSend(user.attachments, {
    maxImages: features?.document_pages_max ?? DEFAULT_PAGES_MAX,
    maxImageBytes: features?.image_bytes_max ?? DEFAULT_IMAGE_BYTES,
    otherChars: user.text.length,
  });
  // Not even one picture fits in a request: say so instead of asking without them.
  if (images.length === 0 && dropped > 0) {
    throw new ApiError({
      status: 413,
      code: 'request_too_large',
      message: 'The pictures are too large to send.',
    });
  }
  const json = JSON.stringify(
    buildAskBody({
      question: user.text,
      chatId: useChatsStore.getState().chats[chatId]?.serverId,
      images,
      audio: voice?.audio,
      replyAsVoice: voice?.replyAsVoice,
    }),
  );
  await savePendingBody(key, json);
  return { json, note: dropped > 0 ? droppedNote(images.length) : undefined, reused: false };
}

/** Sends the question `userId` and puts the answer in `answerId` (which shows the waiting dots). */
async function runAsk(
  chatId: string,
  userId: string,
  answerId: string,
  voice?: VoiceInput,
): Promise<AskResult> {
  const user = findUser(chatId, userId);
  if (!user) return { voiceReply: null };
  const key = user.idempotencyKey ?? newId();
  const chats = useChatsStore.getState();
  if (!user.idempotencyKey) {
    chats.updateMessage(chatId, userId, (m) => ({ ...m, idempotencyKey: key }) as UserMessage);
  }

  useLiveStore.getState().start(chatId, answerId);
  // Whether this key ever went out before this answer: then the first send may still be
  // answered, and the key must stay (chat/keyRule.ts).
  let reused = false;
  let sends = 0;
  try {
    const body = await bodyFor(chatId, user, key, voice);
    reused = body.reused;
    const { json, note } = body;
    const response = await askWithReplay(() => {
      sends += 1;
      return authed((token) =>
        // A try that runs past api.ASK_TIMEOUT_MS is re-sent with the same key.
        api.ask(token, json, { idempotencyKey: key }),
      );
    });
    await deletePendingBody(key);

    const store = useChatsStore.getState();
    store.linkServer(chatId, response.chat_id);
    store.updateMessage(chatId, userId, (message) => {
      const question = message as UserMessage;
      const heard = question.voice && response.transcript ? response.transcript : question.text;
      return { ...question, text: heard, status: 'sent', requestId: response.request_id };
    });
    // The server never sends photos back: they are kept by request id for later syncs.
    store.rememberAttachments(chatId, response.request_id, user.attachments);
    const incomplete =
      response.finish_reason != null && response.finish_reason !== 'completed' ? INCOMPLETE : '';
    const answer: AssistantMessage = {
      id: answerId,
      role: 'assistant',
      text: response.answer ?? '',
      status: 'done',
      note: [note, incomplete].filter(Boolean).join(' ') || undefined,
      createdAt: Date.now(),
      requestId: response.request_id,
    };
    store.updateMessage(chatId, answerId, (message) => ({
      ...answer,
      createdAt: message.createdAt,
    }));
    // A question sent again (after a restart) may already be shown from the server.
    store.mergeAnswered(chatId, userId, answerId, response.request_id);
    AccessibilityInfo.announceForAccessibility('Answer ready');
    // Today's usage and the server's title for the chat.
    useAuthStore
      .getState()
      .refreshMe()
      .catch(() => {});
    refreshChats().catch(() => {});
    return { answer, voiceReply: response.voice_reply };
  } catch (error) {
    return failAsk(chatId, userId, answerId, key, error, !reused && sends <= 1);
  } finally {
    useLiveStore.getState().clear();
  }
}

async function failAsk(
  chatId: string,
  userId: string,
  answerId: string,
  key: string,
  error: unknown,
  firstSend: boolean,
): Promise<AskResult> {
  const store = useChatsStore.getState();
  haptics.error();

  if (isReplayable(error)) {
    // The answer may still come back. Keep the key and the saved body: Retry gets it for free.
    store.removeMessage(chatId, answerId);
    store.updateMessage(chatId, userId, (m) => ({ ...m, status: 'failed' }) as UserMessage);
    return { voiceReply: null };
  }

  // The server refused the very first send of this key: nothing was answered or charged, so
  // the next try is a new question with a new key. In every other case the key and the saved
  // body stay, so a Retry gets the first send's answer and is charged once.
  if (canStartOver(error, firstSend)) {
    await deletePendingBody(key);
    store.updateMessage(
      chatId,
      userId,
      (m) => ({ ...m, idempotencyKey: undefined }) as UserMessage,
    );
  }
  if (isSessionError(error)) {
    store.removeMessage(chatId, answerId);
    store.updateMessage(chatId, userId, (m) => ({ ...m, status: 'failed' }) as UserMessage);
    return { voiceReply: null };
  }
  if (error instanceof ApiError && error.code === 'chat_not_active') {
    store.updateChat(chatId, { canContinue: false });
  }
  const note = error instanceof ApiError ? friendlyError(error) : messageOf(error);
  const failed: AssistantMessage = {
    id: answerId,
    role: 'assistant',
    text: '',
    status: 'error',
    note,
    createdAt: Date.now(),
  };
  store.updateMessage(chatId, answerId, (message) => ({ ...failed, createdAt: message.createdAt }));
  return { answer: failed, voiceReply: null };
}

function messageOf(error: unknown) {
  return error instanceof Error && error.message === VOICE_GONE ? VOICE_GONE : friendlyError(error);
}

function chatForNewQuestion(title: string) {
  const store = useChatsStore.getState();
  const active = store.activeChatId;
  return active && store.chats[active] ? active : store.createChat(title);
}

/**
 * Asks a question in the chat on screen, or starts a new chat.
 * Resolves with the answer (undefined if it could not be sent).
 */
export async function sendMessage(text: string, attachments: Attachment[]) {
  if (useLiveStore.getState().answer) return undefined;
  const chatId = chatForNewQuestion(titleFrom(text, attachments));
  const user: UserMessage = {
    id: newId(),
    role: 'user',
    text: text.trim(),
    attachments,
    createdAt: Date.now(),
    status: 'sent',
    idempotencyKey: newId(),
  };
  const answer = waitingAnswer();
  useChatsStore.getState().appendMessages(chatId, [user, answer]);
  const result = await runAsk(chatId, user.id, answer.id);
  return result.answer;
}

/**
 * Asks by voice. The server writes down what was said (it becomes the question's text) and,
 * with `replyAsVoice`, sends a spoken answer too.
 */
export async function sendVoice(audio: AskAudio, options: { replyAsVoice: boolean }) {
  if (useLiveStore.getState().answer) return { voiceReply: null } as AskResult;
  const chatId = chatForNewQuestion('Voice message');
  const user: UserMessage = {
    id: newId(),
    role: 'user',
    text: '',
    attachments: [],
    createdAt: Date.now(),
    status: 'sent',
    voice: true,
    idempotencyKey: newId(),
  };
  const answer = waitingAnswer();
  useChatsStore.getState().appendMessages(chatId, [user, answer]);
  return runAsk(chatId, user.id, answer.id, { audio, replyAsVoice: options.replyAsVoice });
}

/** Sends a "Not sent" question again, with the same key: an answer already made comes back free. */
export async function retrySend(chatId: string, userMessageId: string) {
  if (useLiveStore.getState().answer) return undefined;
  if (!findUser(chatId, userMessageId)) return undefined;
  const store = useChatsStore.getState();
  store.updateMessage(chatId, userMessageId, (m) => ({ ...m, status: 'sent' }) as UserMessage);
  const answer = waitingAnswer();
  store.appendMessages(chatId, [answer]);
  const result = await runAsk(chatId, userMessageId, answer.id);
  return result.answer;
}

/** Asks again for an answer that failed. It replaces the failed one. */
export async function retryAnswer(chatId: string, answerId: string) {
  if (useLiveStore.getState().answer) return undefined;
  const messages = useChatsStore.getState().chats[chatId]?.messages ?? [];
  const index = messages.findIndex((message) => message.id === answerId);
  const question = messages[index - 1];
  if (index < 1 || question?.role !== 'user') return undefined;
  useChatsStore.getState().updateMessage(chatId, answerId, (message) => ({
    ...waitingAnswer(),
    id: answerId,
    createdAt: message.createdAt,
  }));
  const result = await runAsk(chatId, question.id, answerId);
  return result.answer;
}
