import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { fadeIn, fadeOut } from '@/theme/motion';
import { colors, hitSlopFor, shadows, sizes } from '@/theme/tokens';

const SIZE = 40;

type ScrollToBottomButtonProps = {
  onPress: () => void;
  /** A small violet dot while an answer streams below. */
  streaming: boolean;
};

/** The round "jump to the latest message" button. */
export function ScrollToBottomButton({ onPress, streaming }: ScrollToBottomButtonProps) {
  return (
    <Animated.View entering={fadeIn()} exiting={fadeOut()}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Scroll to latest message"
        hitSlop={hitSlopFor(SIZE)}
        onPress={onPress}
        style={styles.button}
      >
        <ArrowDownIcon size={sizes.icon.chip + 2} color={colors.ink} weight="regular" />
        {streaming ? <View style={styles.dot} /> : null}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // It floats over messages, so it is closer to solid white than the header's glass.
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.float,
  },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
