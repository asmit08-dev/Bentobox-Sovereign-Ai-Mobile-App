import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { Pulse } from '@/components/ui/Pulse';
import { fadeIn } from '@/theme/motion';
import { useTheme } from '@/theme/theme';
import { spacing, typography } from '@/theme/tokens';

// After this long with no words, the label changes so the user knows it is still going.
const SLOW_AFTER_MS = 15000;
// The dot and the word breathe together, once every 1.6 seconds.
const BREATH_MS = 1600;
const DOT = 10;

/**
 * Shown before the first word arrives: a dot that slowly breathes, and "Thinking". It is one
 * line of text tall, so the first words take its place without a jump.
 */
export function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const { colors } = useTheme();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const left = Math.max(0, SLOW_AFTER_MS - (Date.now() - startedAt));
    const timer = setTimeout(() => setSlow(true), left);
    return () => clearTimeout(timer);
  }, [startedAt]);

  const label = slow ? 'Still working' : 'Thinking';

  return (
    <Animated.View
      entering={fadeIn()}
      style={styles.row}
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <BreathingDot color={colors.text} />
      {/* With Reduce Motion both stay still; the word alone says what is happening. */}
      <Pulse period={BREATH_MS} minOpacity={0.4}>
        <AppText variant="body" color={colors.textSecondary}>
          {label}
        </AppText>
      </Pulse>
    </Animated.View>
  );
}

/** A small dot that shrinks and grows back, in step with the word beside it. */
function BreathingDot({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      scale.set(1);
      return;
    }
    scale.set(
      withRepeat(
        withTiming(0.6, { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(scale);
  }, [reduceMotion, scale]);

  const breath = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, breath]} />;
}

const styles = StyleSheet.create({
  row: {
    // At least one line of text tall (more with large phone text), so the first words
    // take its place without a jump.
    minHeight: typography.body.lineHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
