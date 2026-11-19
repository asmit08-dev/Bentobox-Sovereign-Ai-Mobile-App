import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { Suggestion } from '@/components/chat/suggestions';
import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';

type SuggestionTileProps = {
  suggestion: Suggestion;
  onPress: (suggestion: Suggestion) => void;
  entering?: ComponentProps<typeof Animated.View>['entering'];
};

/**
 * One white bento tile: the icon in a small violet-tinted square, then the title and a short
 * description. The icon sits on its own line, so the title gets the tile's full width and
 * rarely wraps. The tint echoes the orb above, the same way file cards do.
 */
export function SuggestionTile({ suggestion, onPress, entering }: SuggestionTileProps) {
  const { icon: IconGlyph, title, description } = suggestion;
  const pressProgress = useSharedValue(0);

  // The Lifted shadow fades in while the finger is down.
  const liftStyle = useAnimatedStyle(() => ({ opacity: pressProgress.get() }));

  return (
    <Animated.View entering={entering} style={styles.cell}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={description}
        pressedScale={0.97}
        pressProgress={pressProgress}
        onPress={() => onPress(suggestion)}
        style={styles.tile}
      >
        <Animated.View pointerEvents="none" style={[styles.lift, liftStyle]} />
        <View style={styles.iconChip}>
          <IconGlyph size={sizes.icon.tile} color={colors.accent} weight="fill" />
        </View>
        <AppText variant="titleSm" numberOfLines={2} style={styles.title}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textTertiary} numberOfLines={2}>
          {description}
        </AppText>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: {
    // Two tiles per row. A lone last tile takes the whole row.
    flexBasis: '40%',
    flexGrow: 1,
  },
  tile: {
    flexGrow: 1,
    minHeight: sizes.suggestionTile,
    padding: 14,
    gap: spacing.xxs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.rest,
  },
  lift: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.lifted,
  },
  iconChip: {
    width: sizes.tileIconChip,
    height: sizes.tileIconChip,
    marginBottom: spacing.sm,
    borderRadius: radius.xs,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  title: {
    flexShrink: 1,
  },
});
