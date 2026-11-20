// Motion tokens, plus the entrance presets built from them.
import { Platform } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  ReduceMotion,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';

// In the browser preview, Reanimated's entering animations leave elements stuck out of place,
// so the web preview shows content without entrances. Phones are not affected.
export const ENTRANCES_ON = Platform.OS !== 'web';

export const duration = {
  instant: 100,
  fast: 160,
  base: 240,
  slow: 360,
} as const;

export const easing = {
  enter: Easing.bezier(0.2, 0, 0, 1),
  exit: Easing.bezier(0.3, 0, 1, 1),
} as const;

export const springs = {
  snappy: { damping: 18, stiffness: 320, mass: 0.7 },
  smooth: { damping: 22, stiffness: 200, mass: 1 },
  bouncy: { damping: 12, stiffness: 220, mass: 0.8 },
  // A bottom sheet rising: quick, and it stops at the top instead of bouncing past it.
  sheet: { damping: 110, stiffness: 900, mass: 4, overshootClamping: true },
} as const;

type RiseInOptions = {
  /** How far below its place the element starts, in points. */
  distance: number;
  delay: number;
  duration?: number;
  /** Start scale. 1 means no scale change. */
  fromScale?: number;
};

/**
 * Entrance: the element rises into place while it fades in.
 * Each call returns a new Keyframe, because Keyframe modifiers change the instance.
 */
export function riseIn({ distance, delay, duration: ms = 320, fromScale = 1 }: RiseInOptions) {
  if (!ENTRANCES_ON) return undefined;
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: distance }, { scale: fromScale }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: easing.enter },
  })
    .duration(ms)
    .delay(delay);
}

/** Reduce Motion entrance: a plain 160ms fade, no movement. */
export function fadeInOnly() {
  if (!ENTRANCES_ON) return undefined;
  return FadeIn.duration(duration.fast).reduceMotion(ReduceMotion.Never);
}

/** A plain fade in, for small swaps (icons, labels, blocks that appear). */
export function fadeIn(ms: number = duration.fast, delay = 0) {
  if (!ENTRANCES_ON) return undefined;
  return FadeIn.duration(ms).delay(delay);
}

/** A plain fade out, the partner of fadeIn. */
export function fadeOut(ms: number = duration.fast) {
  if (!ENTRANCES_ON) return undefined;
  return FadeOut.duration(ms);
}

/** Neighbours slide into their new place (smooth spring) when an item is added or removed. */
export function smoothLayout() {
  if (!ENTRANCES_ON) return undefined;
  return LinearTransition.springify()
    .damping(springs.smooth.damping)
    .stiffness(springs.smooth.stiffness)
    .mass(springs.smooth.mass);
}

/** A thumbnail popping in: scale 0.6 → 1 with the bouncy spring. */
export function popIn() {
  if (!ENTRANCES_ON) return undefined;
  return ZoomIn.springify()
    .damping(springs.bouncy.damping)
    .stiffness(springs.bouncy.stiffness)
    .mass(springs.bouncy.mass);
}

/** A thumbnail leaving: it shrinks and fades (160ms). */
export function popOut() {
  if (!ENTRANCES_ON) return undefined;
  return ZoomOut.duration(duration.fast);
}
