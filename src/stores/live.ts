// The answer that is streaming right now. Not saved. When it ends, chat/engine.ts
// copies it into the saved chat and clears this store.
import { create } from 'zustand';

import type { CreatedImage } from '@/api/contract';

/** waiting: nothing has arrived yet. writing: text is arriving. creating_image: a picture is being made. */
export type LivePhase = 'waiting' | 'writing' | 'creating_image';

export type LiveAnswer = {
  chatId: string;
  messageId: string;
  text: string;
  images: CreatedImage[];
  phase: LivePhase;
  startedAt: number;
};

type LiveState = {
  answer: LiveAnswer | null;
  start: (chatId: string, messageId: string) => void;
  appendText: (text: string) => void;
  setPhase: (phase: LivePhase) => void;
  addImage: (image: CreatedImage) => void;
  clear: () => void;
};

export const useLiveStore = create<LiveState>()((set) => ({
  answer: null,
  start: (chatId, messageId) =>
    set({
      answer: { chatId, messageId, text: '', images: [], phase: 'waiting', startedAt: Date.now() },
    }),
  appendText: (text) =>
    set((state) =>
      state.answer
        ? { answer: { ...state.answer, text: state.answer.text + text, phase: 'writing' } }
        : state,
    ),
  setPhase: (phase) =>
    set((state) => (state.answer ? { answer: { ...state.answer, phase } } : state)),
  addImage: (image) =>
    set((state) =>
      state.answer
        ? { answer: { ...state.answer, images: [...state.answer.images, image], phase: 'writing' } }
        : state,
    ),
  clear: () => set({ answer: null }),
}));

/** True while any answer is streaming. Send turns into Stop. */
export function useIsAnswering() {
  return useLiveStore((state) => state.answer !== null);
}

/** The live answer for one message, or null when that message is not streaming. */
export function useLiveAnswerFor(messageId: string) {
  return useLiveStore((state) => (state.answer?.messageId === messageId ? state.answer : null));
}
