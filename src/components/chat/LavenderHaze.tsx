import { Canvas, Circle, Group, RadialGradient, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppActive } from '@/hooks/useAppActive';
import { useLoopClock } from '@/hooks/useLoopClock';
import { withAlpha } from '@/lib/color';
import { duration, easing } from '@/theme/motion';
import { colors } from '@/theme/tokens';

const TAU = Math.PI * 2;
const DRIFT_MS = 20000; // one slow drift loop
const FADE_IN_MS = 600;

// Strongest lavender in the middle, fading to nothing at the edge.
const GLOW_COLORS = [
  colors.canvasGlow,
  withAlpha(colors.canvasMist, 0.75),
  withAlpha(colors.canvasMist, 0),
];
const GLOW_STOPS = [0, 0.45, 1];

/**
 * The lavender canvas behind the screen: two soft glows (top right and bottom left)
 * that drift very slowly. Text never sits inside a card here, only on this layer.
 * Place it first inside a view that has `backgroundColor: colors.canvas`.
 */
export function LavenderHaze() {
  const reduceMotion = useReducedMotion();
  const appActive = useAppActive();
  const time = useLoopClock(appActive && !reduceMotion);
  const size = useSharedValue({ width: 0, height: 0 });
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(
      withTiming(1, { duration: reduceMotion ? duration.fast : FADE_IN_MS, easing: easing.enter }),
    );
  }, [opacity, reduceMotion]);

  const topCenter = useDerivedValue(() => {
    const { width, height } = size.get();
    const a = (time.get() / DRIFT_MS) * TAU;
    return vec(width * (0.95 + 0.06 * Math.sin(a)), height * (0.1 + 0.03 * Math.cos(a)));
  });
  const topRadius = useDerivedValue(() => size.get().width * 0.85);

  const bottomCenter = useDerivedValue(() => {
    const { width, height } = size.get();
    const a = (time.get() / DRIFT_MS) * TAU;
    return vec(width * (0.02 - 0.06 * Math.sin(a)), height * (0.86 - 0.03 * Math.cos(a)));
  });
  const bottomRadius = useDerivedValue(() => size.get().width * 0.95);

  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      onSize={size}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Group opacity={opacity}>
        <Circle c={topCenter} r={topRadius} dither>
          <RadialGradient c={topCenter} r={topRadius} colors={GLOW_COLORS} positions={GLOW_STOPS} />
        </Circle>
        <Circle c={bottomCenter} r={bottomRadius} dither>
          <RadialGradient
            c={bottomCenter}
            r={bottomRadius}
            colors={GLOW_COLORS}
            positions={GLOW_STOPS}
          />
        </Circle>
      </Group>
    </Canvas>
  );
}
