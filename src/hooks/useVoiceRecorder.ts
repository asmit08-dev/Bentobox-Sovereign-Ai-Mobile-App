import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Platform } from 'react-native';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/** Mic loudness in dB (about -60 quiet … 0 loud) → 0…1. */
function levelFrom(metering: number | undefined) {
  if (metering === undefined || !Number.isFinite(metering)) return 0;
  return Math.min(1, Math.max(0, (metering + 60) / 60));
}

/** The recording's type, for the speech-to-text service. */
export const RECORDING_MIME_TYPE = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';

/**
 * Records the mic. `start()` asks for permission the first time.
 * `stop()` returns the recording's file URI.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 80);

  async function start() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return false;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }

  async function stop() {
    if (recorder.isRecording) await recorder.stop();
    // Switch the iPhone back to the loud speaker for spoken answers.
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    return recorder.uri;
  }

  return {
    start,
    stop,
    isRecording: state.isRecording,
    durationMillis: state.durationMillis,
    level: levelFrom(state.metering),
  };
}
