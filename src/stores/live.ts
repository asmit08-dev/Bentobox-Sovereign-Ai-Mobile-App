// The question that is waiting for its answer right now. Not saved. One at a time.
import { create } from 'zustand';

export type LiveAnswer = {
  chatId: string;
  /** The answer's message id (it shows the waiting dots). */
  messageId: string;
  startedAt: number;
};

type LiveState = {
  answer: LiveAnswer | null;
  start: (chatId: string, messageId: string) => void;
  clear: () => void;
};

export const useLiveStore = create<LiveState>()((set) => ({
  answer: null,
  start: (chatId, messageId) => set({ answer: { chatId, messageId, startedAt: Date.now() } }),
  clear: () => set({ answer: null }),
}));

/** True while a question waits for its answer. The send button shows a spinner. */
export function useIsAnswering() {
  return useLiveStore((state) => state.answer !== null);
}

/** The live answer for one message, or null when that message is not waiting. */
export function useLiveAnswerFor(messageId: string) {
  return useLiveStore((state) => (state.answer?.messageId === messageId ? state.answer : null));
}
