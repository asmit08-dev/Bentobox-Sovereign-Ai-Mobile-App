import { PaperPlaneTiltIcon } from 'phosphor-react-native/src/icons/PaperPlaneTilt';
import { SquareIcon } from 'phosphor-react-native/src/icons/Square';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { haptics } from '@/lib/haptics';
import { duration, fadeIn, fadeOut, springs } from '@/theme/motion';
import { colors, hitSlopFor, shadows, sizes } from '@/theme/tokens';

type SendButtonProps = {
  /** "stop" while an answer streams: the button stops it. */
  mode: 'send' | 'stop';
  /** False when there is nothing to send (only used in "send" mode). */
  enabled: boolean;
  onSend: () => void;
  onStop: () => void;
};

/**
 * The ink circle that sends the message. Gray and not pressable when there is nothing to send.
 * While an answer streams it turns into Stop (a square).
 */
export function SendButton({ mode, enabled, onSend, onStop }: SendButtonProps) {
  const isStop = mode === 'stop';
  const active = isStop || enabled;
  const reduceMotion = useReducedMotion();
  const wake = useSharedValue(1);
  const canSend = enabled && !isStop;
  const couldSend = useRef(canSend);

  // The button wakes up with a small pop at the moment there is something to send.
  // (Not when it turns into Stop: that change already has its own cross-fade.)
  useEffect(() => {
    const woke = canSend && !couldSend.current;
    couldSend.current = canSend;
    if (!woke || reduceMotion) return;
    wake.set(withSequence(withTiming(0.88, { duration: 60 }), withSpring(1, springs.bouncy)));
  }, [canSend, reduceMotion, wake]);

  const wakeStyle = useAnimatedStyle(() => ({ transform: [{ scale: wake.get() }] }));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={isStop ? 'Stop answer' : 'Send message'}
      accessibilityState={{ disabled: !active }}
      disabled={!active}
      hitSlop={hitSlopFor(sizes.sendButton)}
      onPress={() => {
        if (isStop) {
          onStop();
        } else {
          haptics.light();
          onSend();
        }
      }}
    >
      {/* The pop lives on its own view, apart from the fill's fade below. */}
      <Animated.View style={wakeStyle}>
        <Animated.View
          style={[
            styles.circle,
            active ? styles.enabled : styles.disabled,
            // The fill fades from gray to ink in 160ms when the first character is typed.
            { transitionProperty: 'backgroundColor', transitionDuration: duration.fast },
          ]}
        >
          {/* The icon cross-fades between Send and Stop. */}
          {isStop ? (
            <Animated.View key="stop" entering={fadeIn()} exiting={fadeOut()} style={styles.icon}>
              <SquareIcon size={14} color={colors.onInk} weight="fill" />
            </Animated.View>
          ) : (
            <Animated.View key="send" entering={fadeIn()} exiting={fadeOut()} style={styles.icon}>
              <PaperPlaneTiltIcon size={sizes.icon.send} color={colors.onInk} weight="fill" />
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: sizes.sendButton,
    height: sizes.sendButton,
    borderRadius: sizes.sendButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enabled: {
    backgroundColor: colors.ink,
    boxShadow: shadows.float,
  },
  disabled: {
    backgroundColor: colors.inkDisabled,
  },
  icon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
