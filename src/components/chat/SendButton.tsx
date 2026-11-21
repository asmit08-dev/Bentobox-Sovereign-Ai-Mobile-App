import { ArrowUpIcon } from 'phosphor-react-native/src/icons/ArrowUp';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { VoiceBarsIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/PressableScale';
import { haptics } from '@/lib/haptics';
import { fadeIn, fadeOut, springs } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { hitSlopFor, sizes } from '@/theme/tokens';

/**
 * speak: nothing typed yet; opens voice mode.
 * send: there is something to send.
 * waiting: a question is waiting for its answer. The server can't cancel a question (it still
 * answers and counts it), so there is no Stop: the button shows a spinner and can't be pressed.
 */
export type PrimaryMode = 'speak' | 'send' | 'waiting';

type SendButtonProps = {
  mode: PrimaryMode;
  /** False while files are still being prepared (only used in "send" mode). */
  enabled: boolean;
  onSend: () => void;
  onSpeak: () => void;
};

/**
 * The composer's one strong button: a circle, black in light mode and white in dark mode.
 * With an empty composer it shows the voice bars and opens voice mode. Typing turns it into
 * the Send arrow, and while a question waits for its answer it shows a spinner. The circle keeps
 * its size; only the icon inside cross-fades.
 */
export function SendButton({ mode, enabled, onSend, onSpeak }: SendButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const wake = useSharedValue(1);
  const active = mode === 'speak' || (mode === 'send' && enabled);
  const canSend = mode === 'send' && enabled;
  const couldSend = useRef(canSend);

  // A small pop the moment there is something to send.
  useEffect(() => {
    const woke = canSend && !couldSend.current;
    couldSend.current = canSend;
    if (!woke || reduceMotion) return;
    wake.set(withSequence(withTiming(0.9, { duration: 60 }), withSpring(1, springs.bouncy)));
  }, [canSend, reduceMotion, wake]);

  const wakeStyle = useAnimatedStyle(() => ({ transform: [{ scale: wake.get() }] }));

  function handlePress() {
    if (mode === 'waiting') return;
    if (mode === 'send') {
      haptics.light();
      onSend();
    } else {
      haptics.light();
      onSpeak();
    }
  }

  let label = 'Send message';
  if (mode === 'waiting') label = 'Waiting for the answer';
  else if (mode === 'speak') label = 'Speak';

  const glyph = active ? colors.onPrimary : colors.textTertiary;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={mode === 'speak' ? 'Opens voice mode' : undefined}
      accessibilityState={{ disabled: !active, busy: mode === 'waiting' }}
      disabled={!active}
      hitSlop={hitSlopFor(sizes.sendButton)}
      onPress={handlePress}
    >
      <Animated.View style={[styles.circle, active ? styles.on : styles.off, wakeStyle]}>
        {mode === 'speak' ? (
          <Animated.View key="speak" entering={fadeIn()} exiting={fadeOut()} style={styles.icon}>
            <VoiceBarsIcon size={sizes.icon.send} color={glyph} />
          </Animated.View>
        ) : mode === 'waiting' ? (
          <Animated.View key="waiting" entering={fadeIn()} exiting={fadeOut()} style={styles.icon}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </Animated.View>
        ) : (
          <Animated.View key="send" entering={fadeIn()} exiting={fadeOut()} style={styles.icon}>
            <ArrowUpIcon size={sizes.icon.send} color={glyph} weight="bold" />
          </Animated.View>
        )}
      </Animated.View>
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  circle: {
    width: sizes.sendButton,
    height: sizes.sendButton,
    borderRadius: sizes.sendButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  on: {
    backgroundColor: colors.primary,
  },
  off: {
    backgroundColor: colors.fillStrong,
  },
  icon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
