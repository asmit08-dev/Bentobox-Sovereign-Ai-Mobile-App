import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type PulseProps = {
  children: ReactNode;
  /** One full fade out and back in, in ms. */
  period?: number;
  /** The lowest opacity in the loop. */
  minOpacity?: number;
  style?: StyleProp<ViewStyle>;
};

/** Softly fades its content in and out, forever (a shimmer). Still with Reduce Motion. */
export function Pulse({ children, period = 1200, minOpacity = 0.45, style }: PulseProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(
      withRepeat(
        withTiming(minOpacity, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [minOpacity, opacity, period, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
