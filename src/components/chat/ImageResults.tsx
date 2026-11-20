import { LinearGradient } from 'expo-linear-gradient';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import type { CreatedImage } from '@/api/contract';
import { CreatedImageView, aspectOf } from '@/components/chat/CreatedImageView';
import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { useAppActive } from '@/hooks/useAppActive';
import { useLoopClock } from '@/hooks/useLoopClock';
import { withAlpha } from '@/lib/color';
import { ENTRANCES_ON, fadeIn } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { fixed, radius, sizes, spacing } from '@/theme/tokens';

const SINGLE_MAX_WIDTH = 260;
const PLACEHOLDER = 240;
// The placeholder's colors turn once every SWIRL_MS. A band of light crosses it in SWEEP_MS,
// then rests until the cycle ends.
const SWIRL_MS = 9000;
const SWEEP_MS = 1300;
const SWEEP_CYCLE_MS = 2200;
const SWEEP_WIDTH = 90;
// The turning square must cover the placeholder at every angle: side × √2.
const SWIRL_SIZE = Math.ceil(PLACEHOLDER * Math.SQRT2);
const FAN_ANGLES = [-9, 2, 5];
const FAN_LIFT = [6, 0, 10];
const BORDER = 2;

type ImageResultsProps = {
  images: CreatedImage[];
  /** The width the turn's content column has. */
  maxWidth: number;
  onOpen: (index: number) => void;
};

/** One picture as a card; two or three as a fanned stack; four or more fan the first three + "+N". */
export function ImageResults({ images, maxWidth, onOpen }: ImageResultsProps) {
  const styles = useStyles();
  if (images.length === 0) return null;
  if (images.length === 1) {
    const image = images[0];
    const width = Math.min(SINGLE_MAX_WIDTH, maxWidth);
    const height = Math.round(width / aspectOf(image));
    return (
      <Animated.View entering={fadeIn()} style={styles.single}>
        <PressableScale
          accessibilityRole="imagebutton"
          accessibilityLabel={`${image.alt}. Open image`}
          pressedScale={0.97}
          onPress={() => onOpen(0)}
          style={styles.singleCard}
        >
          <CreatedImageView image={image} width={width} height={height} />
        </PressableScale>
      </Animated.View>
    );
  }
  return <ImageFan images={images} maxWidth={maxWidth} onOpen={onOpen} />;
}

function flyIn(index: number, offsetX: number, angle: number, reduceMotion: boolean) {
  if (!ENTRANCES_ON) return undefined;
  if (reduceMotion) return fadeIn();
  // The cards fly out of the fan's center, each turning into its angle, 70ms apart.
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateX: -offsetX }, { rotate: '0deg' }, { scale: 0.8 }] },
    100: { opacity: 1, transform: [{ translateX: 0 }, { rotate: `${angle}deg` }, { scale: 1 }] },
  })
    .duration(420)
    .delay(index * 70);
}

function ImageFan({ images, maxWidth, onOpen }: ImageResultsProps) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const shown = images.slice(0, 3);
  const extra = images.length - shown.length;
  // Each card overlaps the one before it by about 25%.
  const card = Math.min(140, Math.floor(maxWidth / (1 + 0.75 * (shown.length - 1))));
  const step = card * 0.75;
  const fanWidth = card + step * (shown.length - 1);

  return (
    <View style={[styles.fan, { width: fanWidth, height: card + 24 }]}>
      {shown.map((image, index) => {
        const angle = reduceMotion ? 0 : FAN_ANGLES[index];
        const left = step * index;
        const entering = flyIn(index, left - fanWidth / 2 + card / 2, angle, reduceMotion);
        return (
          <Animated.View
            key={image.id}
            entering={entering}
            style={[
              styles.fanCard,
              {
                left,
                top: 12 - FAN_LIFT[index] / 2,
                width: card,
                height: card,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          >
            <PressableScale
              accessibilityRole="imagebutton"
              accessibilityLabel={`${image.alt}. Image ${index + 1} of ${images.length}`}
              pressedScale={0.97}
              onPress={() => onOpen(index)}
              style={styles.fanInner}
            >
              <CreatedImageView
                image={image}
                width={card - BORDER * 2}
                height={card - BORDER * 2}
              />
            </PressableScale>
          </Animated.View>
        );
      })}
      {extra > 0 ? (
        <View style={[styles.more, { left: fanWidth - 36 }]}>
          <AppText variant="label" color={fixed.white}>{`+${extra}`}</AppText>
        </View>
      ) : null}
    </View>
  );
}

// Soft grays that turn slowly, and a band of light that sweeps across.
const SWIRL = {
  light: ['#E4E4E4', '#F5F5F5', '#DADADA', '#F9F9F9'],
  dark: ['#1E1E1E', '#0E0E0E', '#262626', '#121212'],
} as const;

/**
 * The square shown while a picture is being made: grays swirl slowly and a soft band of light
 * sweeps across. It pauses in the background and stays still with Reduce Motion.
 */
export function ImagePlaceholder() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();
  const swirlColors = SWIRL[theme.name];
  const sweepColors = [
    withAlpha(fixed.white, 0),
    withAlpha(fixed.white, theme.dark ? 0.08 : 0.6),
    withAlpha(fixed.white, 0),
  ] as const;
  const reduceMotion = useReducedMotion();
  const appActive = useAppActive();
  const time = useLoopClock(appActive && !reduceMotion);

  const swirlStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(time.get() / SWIRL_MS) * 360}deg` }],
  }));
  const sweepStyle = useAnimatedStyle(() => {
    const t = Math.min(1, (time.get() % SWEEP_CYCLE_MS) / SWEEP_MS);
    const eased = t * t * (3 - 2 * t);
    const from = -SWEEP_WIDTH * 2;
    const to = PLACEHOLDER + SWEEP_WIDTH;
    return { transform: [{ translateX: from + eased * (to - from) }, { rotate: '20deg' }] };
  });

  return (
    <Animated.View
      entering={fadeIn()}
      style={styles.placeholder}
      accessibilityLabel="Creating image"
      accessibilityLiveRegion="polite"
    >
      <Animated.View style={[styles.swirl, swirlStyle]}>
        <LinearGradient
          colors={swirlColors}
          start={{ x: 0.9, y: 0 }}
          end={{ x: 0.1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {reduceMotion ? null : (
        <Animated.View style={[styles.sweep, sweepStyle]}>
          <LinearGradient
            colors={sweepColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      <View style={styles.placeholderLabel}>
        <SparkleIcon size={sizes.icon.action} color={colors.textSecondary} weight="fill" />
        <AppText variant="caption" color={colors.textSecondary}>
          Creating image…
        </AppText>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, shadows }) => ({
  single: {
    alignSelf: 'flex-start',
  },
  singleCard: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: shadows.photo,
  },
  fan: {
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
  },
  fanCard: {
    position: 'absolute',
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.background,
    padding: BORDER,
    boxShadow: shadows.photo,
  },
  fanInner: {
    flex: 1,
    borderRadius: radius.md - BORDER,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  more: {
    position: 'absolute',
    bottom: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: fixed.black,
  },
  placeholder: {
    alignSelf: 'flex-start',
    width: PLACEHOLDER,
    height: PLACEHOLDER,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  swirl: {
    position: 'absolute',
    top: (PLACEHOLDER - SWIRL_SIZE) / 2,
    left: (PLACEHOLDER - SWIRL_SIZE) / 2,
    width: SWIRL_SIZE,
    height: SWIRL_SIZE,
  },
  sweep: {
    position: 'absolute',
    top: -SWEEP_WIDTH,
    bottom: -SWEEP_WIDTH,
    left: 0,
    width: SWEEP_WIDTH,
  },
  placeholderLabel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
}));
