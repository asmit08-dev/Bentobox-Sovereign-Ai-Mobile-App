import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { fadeIn } from '@/theme/motion';
import { colors, hitSlopFor, radius, shadows, sizes, spacing } from '@/theme/tokens';

// The Retry pill: a 16pt label plus 8pt above and below.
const RETRY_HEIGHT = 32;

type ErrorBlockProps = {
  /** Why it stopped, from the server. */
  detail?: string;
  /** Shown only on the newest answer. */
  onRetry?: () => void;
};

/** Under an answer that broke: "The answer stopped." with the reason and Retry. */
export function ErrorBlock({ detail, onRetry }: ErrorBlockProps) {
  return (
    <Animated.View entering={fadeIn()} style={styles.block} accessibilityLiveRegion="polite">
      <WarningCircleIcon size={20} color={colors.danger} weight="fill" />
      <View style={styles.text}>
        <AppText variant="bodySm" color={colors.danger}>
          The answer stopped.
        </AppText>
        {detail ? (
          <AppText variant="caption" color={colors.danger}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry answer"
          hitSlop={hitSlopFor(RETRY_HEIGHT)}
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <ArrowsClockwiseIcon size={sizes.icon.chip} color={colors.ink} weight="regular" />
          <AppText variant="label" color={colors.ink}>
            Retry
          </AppText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  retry: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadows.rest,
  },
  retryPressed: {
    backgroundColor: colors.surfaceTray,
  },
});
