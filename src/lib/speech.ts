// Reading answers aloud with the phone's own voice (expo-speech). No API key needed.
import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { create } from 'zustand';

type SpeechState = {
  /** The id of the answer being read aloud, or null. */
  speakingId: string | null;
};

export const useSpeechStore = create<SpeechState>()(() => ({ speakingId: null }));

/** Markdown → plain text that sounds right when read aloud. Code is skipped. */
export function speakableText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' (code) ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}[-|:\s]*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Like speakableText, but keeps one line per heading, paragraph or list item (for showing). */
export function readableText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, '\n(code)\n')
    .split(/\n+/)
    .map(speakableText)
    .filter(Boolean)
    .join('\n');
}

/** Android can only read a few thousand characters at once, so long text is split at sentences. */
function splitForSpeech(text: string) {
  const limit = Math.min(Speech.maxSpeechInputLength || 4000, 3800);
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const slice = rest.slice(0, limit);
    const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
    const end = cut > limit / 2 ? cut + 1 : limit;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

let turn = 0;

/**
 * Reads `markdown` aloud. Stops anything already playing.
 * `onEnd` runs once, when it finishes or is stopped.
 */
export async function speak(id: string, markdown: string, onEnd?: () => void) {
  stopSpeaking();
  const text = speakableText(markdown);
  if (!text) {
    onEnd?.();
    return;
  }
  const myTurn = ++turn;
  useSpeechStore.setState({ speakingId: id });

  const end = () => {
    if (myTurn !== turn) return;
    turn++;
    useSpeechStore.setState({ speakingId: null });
    onEnd?.();
  };

  try {
    // Play through the speaker, even when the iPhone's silent switch is on.
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  } catch {
    // Not available (web). Speak anyway.
  }
  if (myTurn !== turn) return; // Stopped while setting up.

  const chunks = splitForSpeech(text);
  chunks.forEach((chunk, index) => {
    const isLast = index === chunks.length - 1;
    Speech.speak(chunk, {
      onDone: isLast ? end : undefined,
      onStopped: end,
      onError: end,
    });
  });
}

export function stopSpeaking() {
  turn++;
  if (useSpeechStore.getState().speakingId !== null) useSpeechStore.setState({ speakingId: null });
  Speech.stop();
}
