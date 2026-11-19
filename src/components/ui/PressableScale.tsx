import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { springs } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESSED_OPACITY = 0.7;

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale while the finger is down. Header buttons and Send use 0.92, tiles 0.97. */
  pressedScale?: number;
  /** Optional: receives the press progress (0 = up, 1 = down) to drive other effects. */
  pressProgress?: SharedValue<number>;
};

/** A Pressable that shrinks a little under the finger (snappy spring). */
export function PressableScale({
  pressedScale = 0.92,
  pressProgress,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const ownProgress = useSharedValue(0);
  const progress = pressProgress ?? ownProgress;

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.get(), [0, 1], [1, pressedScale]) }],
  }));
  // Reduce Motion turns off scale effects, but a press still needs an answer: a dim, not a move.
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [1, PRESSED_OPACITY]),
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        progress.set(withSpring(1, springs.snappy));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        progress.set(withSpring(0, springs.snappy));
        onPressOut?.(event);
      }}
      style={[style, reduceMotion ? dimStyle : scaleStyle]}
    />
  );
}
