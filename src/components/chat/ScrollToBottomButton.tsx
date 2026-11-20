import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { fadeIn, fadeOut } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { hitSlopFor, sizes } from '@/theme/tokens';

const SIZE = 38;

type ScrollToBottomButtonProps = {
  onPress: () => void;
  /** A small dot while an answer streams below. */
  streaming: boolean;
};

/** The round "jump to the latest message" button. */
export function ScrollToBottomButton({ onPress, streaming }: ScrollToBottomButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Animated.View entering={fadeIn()} exiting={fadeOut()}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Scroll to latest message"
        hitSlop={hitSlopFor(SIZE)}
        onPress={onPress}
        style={styles.button}
      >
        <ArrowDownIcon size={sizes.icon.action + 2} color={colors.text} />
        {streaming ? <View style={styles.dot} /> : null}
      </PressableScale>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, shadows }) => ({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
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
    backgroundColor: colors.text,
  },
}));
