import { router } from 'expo-router';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { PaperPlaneTiltIcon } from 'phosphor-react-native/src/icons/PaperPlaneTilt';
import { SpeakerHighIcon } from 'phosphor-react-native/src/icons/SpeakerHigh';
import { SpeakerSlashIcon } from 'phosphor-react-native/src/icons/SpeakerSlash';
import { SquareIcon } from 'phosphor-react-native/src/icons/Square';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { transcribe } from '@/api/endpoints';
import { LavenderHaze } from '@/components/chat/LavenderHaze';
import { Orb, type OrbMode } from '@/components/chat/Orb';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Pulse } from '@/components/ui/Pulse';
import { sendMessage, stopAnswer } from '@/chat/engine';
import { RECORDING_MIME_TYPE, useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { ASSISTANT_NAME } from '@/lib/brand';
import { withAlpha } from '@/lib/color';
import { deleteUri, readUriBase64 } from '@/lib/files';
import { haptics } from '@/lib/haptics';
import { readableText, speak, stopSpeaking } from '@/lib/speech';
import { useLiveStore } from '@/stores/live';
import { duration, fadeIn, smoothLayout } from '@/theme/motion';
import { colors, fontScaleCap, shadows, sizes, spacing, typography } from '@/theme/tokens';

// The orb takes about a third of the usable height, up to its full size.
const ORB_SHARE = 0.3;
const MIC_SIZE = 72;
const DOT = 6;
// A recording stops by itself after 2 minutes.
const MAX_RECORDING_MS = 120_000;

/**
 * idle: waiting for the user. listening: recording. transcribing: turning speech into text.
 * answering: the answer streams. speaking: the answer is read aloud.
 */
type Phase = 'idle' | 'listening' | 'transcribing' | 'answering' | 'speaking';

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Voice mode: talk to the orb, hear the answer. Everything also lands in the chat. */
export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const orbSize = Math.round(
    Math.min(sizes.orbVoice, (height - insets.top - insets.bottom) * ORB_SHARE),
  );
  const reduceMotion = useReducedMotion();
  const recorder = useVoiceRecorder();
  const level = useSharedValue(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [finalText, setFinalText] = useState('');
  const [note, setNote] = useState('');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  const mounted = useRef(true);
  const live = useLiveStore((state) => state.answer);

  const liveHere = live && live.messageId === answerId ? live : null;
  const answerText = readableText(liveHere ? liveHere.text : finalText);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    level.set(withTiming(recorder.level, { duration: 100 }));
  }, [level, recorder.level]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  async function startListening() {
    setNote('');
    stopSpeaking();
    try {
      if (!(await recorder.start())) {
        setNote('Allow microphone access in Settings to talk.');
        return;
      }
      haptics.light();
      setPhase('listening');
    } catch {
      setNote("The microphone couldn't start. Try again.");
    }
  }

  async function finishListening() {
    haptics.light();
    setPhase('transcribing');
    let uri: string | null = null;
    try {
      uri = await recorder.stop();
      if (!uri) throw new Error('Nothing was recorded.');
      const audio = await readUriBase64(uri);
      const { text } = await transcribe({ audio, mimeType: RECORDING_MIME_TYPE });
      if (!mounted.current) return;
      if (!text) {
        setNote("I didn't catch that. Tap the mic and try again.");
        setPhase('idle');
        return;
      }
      setHeard(text);
      setFinalText('');
      setPhase('answering');

      const pending = sendMessage(text, []);
      setAnswerId(useLiveStore.getState().answer?.messageId ?? null);
      const answer = await pending;
      if (!mounted.current) return;
      if (!answer) {
        setNote("Couldn't send that. Check the connection and try again.");
        setPhase('idle');
        return;
      }
      setFinalText(answer.text);
      if (answer.images.length > 0) setNote('I made a picture. Close voice mode to see it.');
      if (answer.status === 'error') setNote(answer.note ?? 'The answer stopped.');
      if (answer.status !== 'done' || !answer.text || mutedRef.current) {
        setPhase('idle');
        return;
      }
      setPhase('speaking');
      void speak(answer.id, answer.text, () => {
        if (mounted.current) setPhase((current) => (current === 'speaking' ? 'idle' : current));
      });
    } catch (error) {
      if (!mounted.current) return;
      setNote(error instanceof Error ? error.message : 'Something went wrong.');
      setPhase('idle');
    } finally {
      if (uri) deleteUri(uri);
    }
  }

  // Long recordings send themselves after MAX_RECORDING_MS.
  const sendLongRecording = useEffectEvent(() => {
    void finishListening();
  });
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = setTimeout(sendLongRecording, MAX_RECORDING_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  function handleMic() {
    switch (phase) {
      case 'idle':
        void startListening();
        break;
      case 'listening':
        void finishListening();
        break;
      case 'speaking':
        stopSpeaking();
        void startListening();
        break;
      case 'answering':
        stopAnswer();
        break;
      case 'transcribing':
        break;
    }
  }

  function toggleMute() {
    haptics.selection();
    if (!muted && phase === 'speaking') stopSpeaking();
    setMuted(!muted);
  }

  async function close() {
    stopSpeaking();
    if (phase === 'listening') {
      const uri = await recorder.stop().catch(() => null);
      if (uri) deleteUri(uri);
    }
    if (router.canGoBack()) router.back();
  }

  let orbMode: OrbMode = 'idle';
  if (phase === 'listening') orbMode = 'listening';
  else if (phase === 'transcribing') orbMode = 'thinking';
  else if (phase === 'answering') orbMode = liveHere?.text ? 'streaming' : 'thinking';
  else if (phase === 'speaking') orbMode = 'speaking';

  let hint = heard ? 'Tap the mic to reply.' : 'Tap the mic and start talking.';
  if (phase === 'listening') hint = `Listening… ${clock(recorder.durationMillis)} · Tap to send`;
  else if (phase === 'transcribing') hint = 'Getting your words…';
  else if (phase === 'answering') hint = liveHere?.text ? 'Answering…' : 'Thinking…';
  else if (phase === 'speaking') hint = 'Speaking… Tap the mic to talk.';

  const listening = phase === 'listening';
  // Only real words move the orb up. A note on its own (no mic access, nothing heard)
  // takes the status line instead, so the orb doesn't jump up and back on the next tap.
  const hasTranscript = Boolean(heard || answerText);
  const status = !hasTranscript && note ? note : hint;

  // While the mic is open, a soft violet halo rings it and swells with the voice.
  const haloStyle = useAnimatedStyle(() => {
    const voice = reduceMotion ? 0 : level.get();
    return {
      opacity: withTiming(listening ? 1 : 0, { duration: 160 }),
      transform: [{ scale: 1.16 + 0.3 * voice }],
    };
  });

  let micLabel = 'Start talking';
  let MicGlyph = MicrophoneIcon;
  if (phase === 'listening') {
    micLabel = 'Send what I said';
    MicGlyph = PaperPlaneTiltIcon;
  } else if (phase === 'answering') {
    micLabel = 'Stop answer';
    MicGlyph = SquareIcon;
  }

  return (
    <View style={styles.screen}>
      <LavenderHaze />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerSide} />
        <AppText variant="title" accessibilityRole="header">
          {`Talking to ${ASSISTANT_NAME}`}
        </AppText>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.status} accessibilityLiveRegion="polite">
        {listening ? (
          <Pulse period={900} minOpacity={0.25}>
            <View style={styles.dot} />
          </Pulse>
        ) : null}
        <AppText variant="bodySm" color={colors.textSecondary} style={styles.hint}>
          {status}
        </AppText>
      </View>

      {/* Alone, the orb sits in the middle. Once words appear, it moves up to make room. */}
      <Animated.View
        layout={smoothLayout()}
        style={[styles.orb, hasTranscript ? styles.orbWithTranscript : styles.orbAlone]}
      >
        {/* The hero of this screen. Its light spills onto the canvas and swells with the voice. */}
        <Orb size={orbSize} mode={orbMode} level={level} aura={1} />
      </Animated.View>

      {hasTranscript ? (
        // Fades in a moment after the orb starts moving up, so the text never shows under it.
        <Animated.View entering={fadeIn(duration.base, duration.fast)} style={styles.transcript}>
          <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
            {heard ? (
              <AppText
                variant="bodySm"
                color={colors.textSecondary}
                maxFontSizeMultiplier={fontScaleCap.message}
              >
                {`“${heard}”`}
              </AppText>
            ) : null}
            {answerText ? (
              <AppText
                variant="title"
                maxFontSizeMultiplier={fontScaleCap.message}
                style={styles.answer}
              >
                {answerText}
              </AppText>
            ) : null}
            {note ? (
              <AppText variant="bodySm" color={colors.textSecondary}>
                {note}
              </AppText>
            ) : null}
          </ScrollView>
        </Animated.View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.xl }]}>
        <IconButton
          icon={muted ? SpeakerSlashIcon : SpeakerHighIcon}
          label={muted ? 'Read answers aloud' : 'Stop reading answers aloud'}
          onPress={toggleMute}
        />
        <View style={styles.micWrap}>
          <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={phase === 'transcribing' ? 'Getting your words' : micLabel}
            accessibilityState={{ busy: phase === 'transcribing' }}
            disabled={phase === 'transcribing'}
            onPress={handleMic}
            style={styles.mic}
          >
            {phase === 'transcribing' ? (
              <ActivityIndicator color={colors.onInk} />
            ) : (
              <MicGlyph size={28} color={colors.onInk} weight="fill" />
            )}
          </PressableScale>
        </View>
        <IconButton icon={XIcon} label="Close voice mode" onPress={() => void close()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  headerSide: {
    width: sizes.iconButton,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing['2xl'],
    marginTop: spacing.sm,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.accent,
  },
  hint: {
    textAlign: 'center',
    flexShrink: 1,
  },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbAlone: {
    flex: 1,
    // A little above the true middle, so the orb and the mic don't feel stacked.
    paddingBottom: spacing['3xl'],
  },
  orbWithTranscript: {
    marginTop: spacing['3xl'],
    marginBottom: spacing['2xl'],
  },
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    gap: spacing.md,
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  answer: {
    ...typography.title,
    lineHeight: 26,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
  },
  micWrap: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    // Violet Tint alone vanishes on the lavender canvas, so the accent at low strength.
    backgroundColor: withAlpha(colors.accent, 0.16),
  },
  mic: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    boxShadow: shadows.float,
  },
});
