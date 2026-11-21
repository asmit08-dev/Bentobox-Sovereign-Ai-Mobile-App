// Plays the server's spoken answer (Ogg/Opus). If it can't play — an error, or nothing within
// 3 s (some phones can't decode Ogg) — the phone's own voice reads the answer's text instead.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import type { VoiceReply } from '@/api/types';
import { deleteUri, writeBase64File } from '@/lib/files';
import { newId } from '@/lib/id';
import { setOtherSpeech, speak, stopSpeaking, useSpeechStore } from '@/lib/speech';

const START_TIMEOUT_MS = 3_000;

function extensionFor(mediaType: string) {
  if (mediaType.includes('ogg')) return 'ogg';
  if (mediaType.includes('mpeg')) return 'mp3';
  if (mediaType.includes('mp4') || mediaType.includes('m4a')) return 'm4a';
  return 'audio';
}

/**
 * Plays `reply` for the answer `id`. `onEnd` runs once when it (or the read-aloud fallback)
 * finishes. Returns a function that stops it (then `onEnd` does not run). stopSpeaking() and
 * a new speak() stop it too.
 */
export function playVoiceReply(
  id: string,
  reply: VoiceReply,
  fallbackText: string,
  onEnd: () => void,
): () => void {
  let player: AudioPlayer | null = null;
  let subscription: { remove: () => void } | null = null;
  let fileUri: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let fellBack = false;
  let done = false;

  function release() {
    if (timer) clearTimeout(timer);
    timer = null;
    subscription?.remove();
    subscription = null;
    player?.remove();
    player = null;
    if (fileUri) deleteUri(fileUri);
    fileUri = null;
  }

  function finish() {
    if (done) return;
    done = true;
    release();
    setOtherSpeech(null);
    if (useSpeechStore.getState().speakingId === id) useSpeechStore.setState({ speakingId: null });
    onEnd();
  }

  function fallBack() {
    if (done || fellBack) return;
    fellBack = true;
    release();
    // speak() would stop "other speech" (this reply) first; it is already released.
    setOtherSpeech(null);
    void speak(id, fallbackText, () => {
      if (done) return;
      done = true;
      onEnd();
    }).then(() => {
      if (!done) setOtherSpeech(stop);
    });
  }

  function stop() {
    if (done) return;
    done = true;
    release();
    if (fellBack) stopSpeaking();
    if (useSpeechStore.getState().speakingId === id) useSpeechStore.setState({ speakingId: null });
  }

  stopSpeaking();
  useSpeechStore.setState({ speakingId: id });
  setOtherSpeech(stop);

  void (async () => {
    try {
      try {
        // Play through the speaker, even when the iPhone's silent switch is on.
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      } catch {
        // Not available (web).
      }
      const file = await writeBase64File(
        `voice-reply-${newId()}.${extensionFor(reply.media_type)}`,
        reply.base64,
        'cache',
      );
      if (done || fellBack) {
        deleteUri(file.uri);
        return;
      }
      fileUri = file.uri;
      player = createAudioPlayer({ uri: file.uri });
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.playing) started = true;
        if (status.didJustFinish) finish();
      });
      timer = setTimeout(() => {
        if (!started) fallBack();
      }, START_TIMEOUT_MS);
      player.play();
    } catch {
      fallBack();
    }
  })();

  return stop;
}
