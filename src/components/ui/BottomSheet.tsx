import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing, springs } from '@/theme/motion';
import { makeStyles } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const GRABBER_WIDTH = 36;
const GRABBER_HEIGHT = 5;
// The sheet's surface runs this far below the screen edge, so lifting it never shows a gap.
const UNDERLAY = 48;
// Dragged up, the sheet gives a little, then stops.
const MAX_LIFT = 16;
// Dragged down past this share of its height, or flicked down, the sheet closes.
const CLOSE_SHARE = 0.3;
const CLOSE_VELOCITY = 800;
// Reduce Motion: the sheet and the dim fade instead of sliding.
const FADE = { duration: duration.fast, reduceMotion: ReduceMotion.Never };

type BottomSheetProps = {
  /** True rises the sheet; false slides it away. Opening again mid-slide brings it back up. */
  open: boolean;
  /** Asks the screen to close the sheet: a tap outside, a drag down, or Back. */
  onClose: () => void;
  /** Called once the sheet has slid away. The screen then unmounts it. */
  onClosed: () => void;
  /** What a screen reader calls the sheet. */
  label: string;
  children: ReactNode;
};

/**
 * A sheet that rises from the bottom of the screen it is mounted in, over the dimmed screen.
 * Tap outside, drag it down, or press Back to close it. Mount it while open or closing.
 */
export function BottomSheet({ open, onClose, onClosed, label, children }: BottomSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // 0: below the screen. 1: all the way up.
  const progress = useSharedValue(0);
  // The sheet's visible height. 0 until it is measured; it rises only after that.
  const height = useSharedValue(0);

  function rise() {
    progress.set(reduceMotion ? withTiming(1, FADE) : withSpring(1, springs.sheet));
  }

  function slideAway() {
    const done = (finished?: boolean) => {
      'worklet';
      // Not when it was interrupted by opening again.
      if (finished) scheduleOnRN(onClosed);
    };
    // It starts fast and settles, so a flick down carries straight through.
    progress.set(
      reduceMotion
        ? withTiming(0, FADE, done)
        : withTiming(0, { duration: duration.base, easing: easing.enter }, done),
    );
  }

  function handleLayout(event: LayoutChangeEvent) {
    const first = height.get() === 0;
    height.set(event.nativeEvent.layout.height - UNDERLAY);
    if (!first) return;
    if (open) rise();
    else onClosed();
  }

  const follow = useEffectEvent((wanted: boolean) => {
    if (height.get() === 0) return;
    if (wanted) rise();
    else slideAway();
  });
  useEffect(() => {
    follow(open);
  }, [open]);

  // Android's Back button closes the sheet first.
  const onBack = useEffectEvent(() => onClose());
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  // Drag the sheet down to close it.
  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    onUpdate: (event) => {
      'worklet';
      // With Reduce Motion the sheet stays put; a long drag or flick still closes it.
      if (reduceMotion || height.get() === 0) return;
      const drag = event.translationY;
      const offset = drag >= 0 ? drag : -Math.min(MAX_LIFT, -drag / 3);
      progress.set(1 - offset / height.get());
    },
    onDeactivate: (event) => {
      'worklet';
      if (event.translationY > height.get() * CLOSE_SHARE || event.velocityY > CLOSE_VELOCITY) {
        scheduleOnRN(onClose);
      } else {
        progress.set(withSpring(1, springs.sheet));
      }
    },
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, progress.get())),
  }));
  const sheetStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: progress.get() };
    // Until it is measured, the sheet waits fully below the screen.
    if (height.get() === 0) return { transform: [{ translateY: 1000 }] };
    return { transform: [{ translateY: (1 - progress.get()) * height.get() }] };
  });

  return (
    // While it slides away, taps go through to the screen (so it can be opened again).
    <View style={styles.root} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={handleLayout}
          accessibilityViewIsModal
          accessibilityLabel={label}
          onAccessibilityEscape={onClose}
          style={[
            styles.sheet,
            { paddingBottom: UNDERLAY + Math.max(insets.bottom + spacing.sm, spacing.lg) },
            sheetStyle,
          ]}
        >
          <View style={styles.grabber} />
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadows }) => ({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
  },
  scrim: {
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -UNDERLAY,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.gutter,
    backgroundColor: colors.elevated,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderCurve: 'continuous',
    boxShadow: shadows.lifted,
  },
  grabber: {
    alignSelf: 'center',
    width: GRABBER_WIDTH,
    height: GRABBER_HEIGHT,
    borderRadius: GRABBER_HEIGHT / 2,
    marginBottom: spacing.lg,
    backgroundColor: colors.fillStrong,
  },
}));
