import { ArrowUpIcon } from 'phosphor-react-native/src/icons/ArrowUp';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { SpeakerHighIcon } from 'phosphor-react-native/src/icons/SpeakerHigh';
import { SpeakerSlashIcon } from 'phosphor-react-native/src/icons/SpeakerSlash';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { useEffect, useEffectEvent, useRef, useState, type ComponentType } from 'react';
import { ActivityIndicator, BackHandler, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { Pulse } from '@/components/ui/Pulse';
import type { GlowMode } from '@/components/voice/HorizonGlow';
import { sendVoice } from '@/chat/engine';
import { RECORDING_MIME_TYPE, useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { withAlpha } from '@/lib/color';
import { deleteUri, readUriBase64 } from '@/lib/files';
import { haptics } from '@/lib/haptics';
import { speak, stopSpeaking } from '@/lib/speech';
import { playVoiceReply } from '@/lib/voiceReply';
import { useFeatures } from '@/stores/auth';
import { makeStyles, useTheme } from '@/theme/theme';
import { hitSlopFor, spacing } from '@/theme/tokens';

const TALK = 64;
const SIDE = 50;
const DOT = 6;
// A recording sends itself after 2 minutes.
const MAX_RECORDING_MS = 120_000;
// Voice mode starts listening once its controls have risen into place.
const LISTEN_DELAY_MS = 300;

/**
 * idle: waiting for the user. listening: recording.
 * answering: the server writes down what was said and answers, in one call.
 * speaking: the answer is read aloud.
 */
type Phase = 'idle' | 'listening' | 'answering' | 'speaking';

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function glowFor(phase: Phase): GlowMode {
  if (phase === 'listening') return 'listening';
  if (phase === 'speaking') return 'speaking';
  if (phase === 'answering') return 'thinking';
  return 'idle';
}

type VoiceDockProps = {
  /** False when this account can't ask by voice: the dock says so instead of listening. */
  available: boolean;
  /** The voice's loudness is written here, for the light behind the chat. */
  level: SharedValue<number>;
  /** Tells the screen how the light should behave. */
  onGlowChange: (mode: GlowMode) => void;
  /** Leaves voice mode. */
  onEnd: () => void;
};

/**
 * Voice mode's controls, in the composer's place: read-aloud on the left, the talk button in
 * the middle, and End on the right, with one line above that says what is happening. What the
 * user says and the answer land in the chat above, as messages, while the light rises behind.
 */
export function VoiceDock({ available, level, onGlowChange, onEnd }: VoiceDockProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const recorder = useVoiceRecorder(level);
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  // The server can answer with its own voice; otherwise the phone reads the answer aloud.
  const voiceReplies = useFeatures()?.voice_replies === true;
  const mounted = useRef(true);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    onGlowChange(glowFor(phase));
  }, [onGlowChange, phase]);

  // Leaving voice mode any way (End, the drawer, a new chat) silences it and drops an
  // unfinished recording.
  const releaseMic = useEffectEvent(() => {
    if (phase !== 'listening') return;
    recorder
      .stop()
      .then((uri) => uri && deleteUri(uri))
      .catch(() => {});
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSpeaking();
      releaseMic();
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
    setPhase('answering');
    let uri: string | null = null;
    try {
      uri = await recorder.stop();
      if (!uri) throw new Error('Nothing was recorded.');
      const base64 = await readUriBase64(uri);
      const { answer, voiceReply } = await sendVoice(
        { media_type: RECORDING_MIME_TYPE, base64 },
        { replyAsVoice: voiceReplies && !mutedRef.current },
      );
      if (!mounted.current) return;
      if (!answer) {
        setNote("Couldn't send that. Check the connection and try again.");
        setPhase('idle');
        return;
      }
      if (answer.status === 'error') setNote(answer.note ?? "Couldn't get an answer.");
      if (answer.status !== 'done' || !answer.text || mutedRef.current) {
        setPhase('idle');
        return;
      }
      setPhase('speaking');
      const spoken = () => {
        if (mounted.current) setPhase((current) => (current === 'speaking' ? 'idle' : current));
      };
      if (voiceReply) playVoiceReply(answer.id, voiceReply, answer.text, spoken);
      else void speak(answer.id, answer.text, spoken);
    } catch (error) {
      if (!mounted.current) return;
      setNote(error instanceof Error ? error.message : 'Something went wrong.');
      setPhase('idle');
    } finally {
      if (uri) deleteUri(uri);
    }
  }

  // Voice mode starts listening as soon as it opens.
  const listenOnOpen = useEffectEvent(() => {
    if (available) void startListening();
  });
  useEffect(() => {
    const timer = setTimeout(listenOnOpen, LISTEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Long recordings send themselves after MAX_RECORDING_MS.
  const sendLongRecording = useEffectEvent(() => {
    void finishListening();
  });
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = setTimeout(sendLongRecording, MAX_RECORDING_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  async function end() {
    stopSpeaking();
    if (phase === 'listening') {
      const uri = await recorder.stop().catch(() => null);
      if (uri) deleteUri(uri);
    }
    // A question already sent still gets its answer in the chat.
    onEnd();
  }

  // Android's Back button leaves voice mode.
  const onBack = useEffectEvent(() => void end());
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  function handleTalk() {
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
        break;
    }
  }

  function toggleSpeaker() {
    haptics.selection();
    if (!muted && phase === 'speaking') {
      // A stopped answer doesn't call its end, so the dock goes back to idle here.
      stopSpeaking();
      setPhase('idle');
    }
    setMuted(!muted);
  }

  let status = 'Tap the mic and start talking';
  if (!available) status = "Voice isn't turned on for your account";
  else if (phase === 'listening') status = `Listening  ${clock(recorder.seconds)}`;
  else if (phase === 'answering') status = 'Getting your answer';
  else if (phase === 'speaking') status = 'Speaking · tap to interrupt';
  else if (note) status = note;

  let talkLabel = 'Start talking';
  let TalkGlyph: ComponentType<{ size?: number; color?: string }> = MicrophoneIcon;
  if (phase === 'listening') {
    talkLabel = 'Send what I said';
    TalkGlyph = ArrowUpIcon;
  } else if (phase === 'speaking') {
    talkLabel = 'Interrupt and talk';
  }

  const listening = phase === 'listening';

  // While the mic is open, a soft ring swells around the talk button with the voice.
  const ringStyle = useAnimatedStyle(() => {
    const voice = reduceMotion ? 0 : level.get();
    return {
      opacity: withTiming(listening ? 1 : 0, { duration: 160 }),
      transform: [{ scale: 1.12 + 0.34 * voice }],
    };
  });

  return (
    <View style={styles.dock}>
      <View style={styles.status} accessibilityLiveRegion="polite">
        {listening ? (
          <Pulse period={900} minOpacity={0.25}>
            <View style={styles.dot} />
          </Pulse>
        ) : null}
        <AppText
          variant="bodySm"
          color={colors.textSecondary}
          numberOfLines={2}
          style={styles.statusText}
        >
          {status}
        </AppText>
      </View>

      <View style={styles.row}>
        <SideButton
          icon={muted ? SpeakerSlashIcon : SpeakerHighIcon}
          label={muted ? 'Read answers aloud' : 'Stop reading answers aloud'}
          onPress={toggleSpeaker}
        />

        <View style={styles.talkWrap}>
          <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={phase === 'answering' ? 'Getting your answer' : talkLabel}
            accessibilityState={{ busy: phase === 'answering', disabled: !available }}
            disabled={!available || phase === 'answering'}
            onPress={handleTalk}
            style={[styles.talk, !available && styles.talkOff]}
          >
            {phase === 'answering' ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <TalkGlyph size={26} color={available ? colors.onPrimary : colors.textTertiary} />
            )}
          </PressableScale>
        </View>

        <SideButton icon={XIcon} label="End voice mode" onPress={() => void end()} />
      </View>
    </View>
  );
}

type SideButtonProps = {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
};

/** A quiet round button beside the talk button. */
function SideButton({ icon: Glyph, label, onPress }: SideButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlopFor(SIDE)}
      onPress={onPress}
      style={({ pressed }) => [styles.side, pressed && styles.sidePressed]}
    >
      <Glyph size={22} color={colors.text} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, dark }) => ({
  dock: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  status: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing['2xl'],
  },
  statusText: {
    textAlign: 'center',
    flexShrink: 1,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.text,
  },
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
  },
  side: {
    width: SIDE,
    height: SIDE,
    borderRadius: SIDE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Frosted: the light behind shows through a little.
    backgroundColor: withAlpha(dark ? '#1C1C1C' : '#FFFFFF', dark ? 0.7 : 0.78),
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  sidePressed: {
    backgroundColor: colors.fillStrong,
  },
  talkWrap: {
    width: TALK,
    height: TALK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: TALK,
    height: TALK,
    borderRadius: TALK / 2,
    backgroundColor: withAlpha(dark ? '#FFFFFF' : '#000000', dark ? 0.16 : 0.08),
  },
  talk: {
    width: TALK,
    height: TALK,
    borderRadius: TALK / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  talkOff: {
    backgroundColor: colors.fillStrong,
  },
}));
