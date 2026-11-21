import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { fadeIn } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { hitSlopFor, radius, sizes, spacing } from '@/theme/tokens';

// The Retry pill: a 16pt label plus 8pt above and below.
const RETRY_HEIGHT = 32;

type ErrorBlockProps = {
  /** Why, in plain words. */
  detail?: string;
  /** Shown only on the newest answer. */
  onRetry?: () => void;
};

/** Under a question that got no answer: "Couldn't get an answer." with the reason and Retry. */
export function ErrorBlock({ detail, onRetry }: ErrorBlockProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Animated.View entering={fadeIn()} style={styles.block} accessibilityLiveRegion="polite">
      <WarningCircleIcon size={20} color={colors.danger} weight="fill" />
      <View style={styles.text}>
        <AppText variant="bodySm" color={colors.danger}>
          {"Couldn't get an answer."}
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
          <ArrowsClockwiseIcon size={sizes.icon.action} color={colors.text} />
          <AppText variant="label" color={colors.text}>
            Retry
          </AppText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, shadows }) => ({
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
    backgroundColor: colors.elevated,
    boxShadow: shadows.rest,
  },
  retryPressed: {
    backgroundColor: colors.fill,
  },
}));
