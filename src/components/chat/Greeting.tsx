import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Orb } from '@/components/chat/Orb';
import { AppText } from '@/components/ui/AppText';
import { useGreeting } from '@/hooks/useGreeting';
import { fadeInOnly, riseIn } from '@/theme/motion';
import { colors, sizes, spacing } from '@/theme/tokens';

type GreetingProps = {
  /** The hero orb's size. 0 hides it (short phones hide the orb first, then the subtitle). */
  orbSize: number;
  showSubtitle: boolean;
  /** Reports how tall the words are (they wrap with big text), so the orb can give way. */
  onWordsHeight: (height: number) => void;
};

/** The centered welcome block of a new chat: the hero orb, time-of-day line, headline, subtitle. */
export function Greeting({ orbSize, showSubtitle, onWordsHeight }: GreetingProps) {
  const reduceMotion = useReducedMotion();
  const greeting = useGreeting();

  // The lines rise 8pt and fade in, 60ms apart.
  const lineEnter = (delay: number) =>
    reduceMotion ? fadeInOnly() : riseIn({ distance: 8, delay });

  return (
    <View style={styles.block}>
      {orbSize > 0 ? (
        <Animated.View
          entering={
            reduceMotion
              ? fadeInOnly()
              : riseIn({ distance: 0, delay: 0, duration: 420, fromScale: 0.8 })
          }
          style={styles.orb}
        >
          {/* The one alive thing on the screen. Its light spills onto the canvas around it. */}
          <Orb size={orbSize} aura={1} />
        </Animated.View>
      ) : null}

      <View
        style={styles.words}
        onLayout={(event) => onWordsHeight(Math.round(event.nativeEvent.layout.height))}
      >
        <Animated.View entering={lineEnter(60)}>
          <AppText variant="displaySoft" color={colors.textSecondary} style={styles.center}>
            {greeting}
          </AppText>
        </Animated.View>

        <Animated.View entering={lineEnter(120)}>
          <AppText variant="display" accessibilityRole="header" style={styles.center}>
            How can I help today?
          </AppText>
        </Animated.View>

        {showSubtitle ? (
          <Animated.View entering={lineEnter(180)} style={styles.subtitle}>
            <AppText
              variant="bodySm"
              color={colors.textSecondary}
              numberOfLines={2}
              style={styles.center}
            >
              Ask anything, or add a photo or document.
            </AppText>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignSelf: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: sizes.greetingMaxWidth,
  },
  orb: {
    marginBottom: spacing.xl,
  },
  words: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  subtitle: {
    marginTop: spacing.md,
  },
  center: {
    textAlign: 'center',
  },
});
