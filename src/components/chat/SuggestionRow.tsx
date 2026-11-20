import { useEffect } from 'react';
import { ScrollView } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { Suggestion } from '@/components/chat/suggestions';
import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { duration, fadeInOnly, riseIn } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, sizes, spacing } from '@/theme/tokens';

const CARD_MIN_WIDTH = 124;

type SuggestionRowProps = {
  suggestions: Suggestion[];
  /** False while the user writes or has files waiting: the row fades away but keeps its room. */
  visible: boolean;
  onPress: (suggestion: Suggestion) => void;
};

/**
 * Things to try on a new chat: a row of soft cards just above the composer, where the thumb is.
 * It scrolls sideways; the next card peeks in at the edge to show there is more.
 */
export function SuggestionRow({ suggestions, visible, onPress }: SuggestionRowProps) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    shown.set(withTiming(visible ? 1 : 0, { duration: duration.fast }));
  }, [shown, visible]);

  // It keeps its height while hidden, so nothing above it jumps when typing starts.
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * spacing.sm }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.wrap, fadeStyle]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
      >
        {suggestions.map((suggestion, index) => (
          <Animated.View
            key={suggestion.id}
            entering={
              reduceMotion
                ? fadeInOnly()
                : riseIn({ distance: 10, delay: 160 + index * 45, duration: 380 })
            }
          >
            <SuggestionCard suggestion={suggestion} onPress={onPress} />
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

type SuggestionCardProps = {
  suggestion: Suggestion;
  onPress: (suggestion: Suggestion) => void;
};

/** One suggestion: a line icon over its short name. */
function SuggestionCard({ suggestion, onPress }: SuggestionCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { icon: Glyph, title, description } = suggestion;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      pressedScale={0.97}
      onPress={() => onPress(suggestion)}
      style={styles.card}
    >
      <Glyph size={sizes.icon.chip} color={colors.text} />
      <AppText variant="titleSm" numberOfLines={1}>
        {title}
      </AppText>
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  wrap: {
    paddingBottom: spacing.sm + 2,
  },
  row: {
    gap: spacing.sm,
    // The first card lines up with the composer's edge.
    paddingHorizontal: spacing.gutter - spacing.xs,
  },
  card: {
    minWidth: CARD_MIN_WIDTH,
    gap: spacing.md + 2,
    paddingTop: spacing.md + 2,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
}));
