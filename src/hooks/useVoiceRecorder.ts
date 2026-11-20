import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

// How often the mic's loudness is read while recording.
const POLL_MS = 50;
// The quiet room: the floor follows the quietest level at once and drifts up 1 dB a second,
// so a voice always stands out from the room it is spoken in.
const START_FLOOR_DB = -50;
const FLOOR_RISE_DB_PER_S = 1;
// A voice this many dB over the floor is full scale.
const RANGE_DB = 28;

/** The recording's type, for the speech-to-text service. */
export const RECORDING_MIME_TYPE = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';

/**
 * Records the mic. `start()` asks for permission the first time; `stop()` returns the
 * recording's file URI.
 *
 * `level` is the voice's loudness (0 quiet … 1 loud), measured against the room's own noise and
 * smoothed: it rises fast and falls slowly. It lives on the UI thread, so following it never
 * re-renders anything. Pass `levelSink` to have it written into a value the caller owns.
 * `seconds` (for the timer) changes once a second.
 */
export function useVoiceRecorder(levelSink?: SharedValue<number>) {
  const recorder = useAudioRecorder(OPTIONS);
  const ownLevel = useSharedValue(0);
  const level = levelSink ?? ownLevel;
  const [seconds, setSeconds] = useState(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    level.set(withTiming(0, { duration: 260 }));
  }

  function startPolling() {
    stopPolling();
    setSeconds(0);
    let floor = START_FLOOR_DB;
    let last = Date.now();
    let current = 0;
    poll.current = setInterval(() => {
      const status = recorder.getStatus();
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      last = now;
      setSeconds(Math.floor(status.durationMillis / 1000));

      const db = status.metering;
      if (db === undefined || !Number.isFinite(db)) return;
      floor = Math.min(db, floor + FLOOR_RISE_DB_PER_S * elapsed);
      const raw = Math.min(1, Math.max(0, (db - floor - 4) / RANGE_DB)) ** 0.75;
      // Up in 60ms, down in 260ms: a word lights up at once and fades out gently.
      level.set(withTiming(raw, { duration: raw > current ? 60 : 260 }));
      current = raw;
    }, POLL_MS);
  }

  // Leaving mid-recording stops the readings.
  useEffect(
    () => () => {
      if (poll.current) clearInterval(poll.current);
    },
    [],
  );

  async function start() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return false;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startPolling();
    return true;
  }

  async function stop() {
    stopPolling();
    if (recorder.isRecording) await recorder.stop();
    // Switch the iPhone back to the loud speaker for spoken answers.
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    return recorder.uri;
  }

  return { start, stop, level, seconds };
}
