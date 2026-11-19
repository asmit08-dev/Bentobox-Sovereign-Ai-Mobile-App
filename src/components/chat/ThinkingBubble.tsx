import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { Pulse } from '@/components/ui/Pulse';
import { fadeIn } from '@/theme/motion';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

// After this long with no words, the label changes so the user knows it is still going.
const SLOW_AFTER_MS = 15000;

/**
 * The small "Thinking…" bubble shown before the first word arrives.
 * It holds the place where the answer will be, so the first words do not push the list.
 */
export function ThinkingBubble({ startedAt }: { startedAt: number }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const left = Math.max(0, SLOW_AFTER_MS - (Date.now() - startedAt));
    const timer = setTimeout(() => setSlow(true), left);
    return () => clearTimeout(timer);
  }, [startedAt]);

  const label = slow ? 'Still working…' : 'Thinking…';

  return (
    <Animated.View
      entering={fadeIn()}
      style={styles.bubble}
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <Pulse>
        <AppText variant="body" color={colors.textSecondary}>
          {label}
        </AppText>
      </Pulse>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The same box as an answer bubble (same padding, same line height), so the first
  // words take its place without a jump.
  bubble: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.xs,
    boxShadow: shadows.rest,
  },
});
