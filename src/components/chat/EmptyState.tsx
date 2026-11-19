import { useState, type RefObject } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextInputInstance,
} from 'react-native';
import Animated, { Keyframe, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Greeting } from '@/components/chat/Greeting';
import { SuggestionTile } from '@/components/chat/SuggestionTile';
import { suggestionsFor, type Suggestion } from '@/components/chat/suggestions';
import { addDocuments, addPhotosFromLibrary } from '@/chat/attachments';
import { haptics } from '@/lib/haptics';
import { useComposerStore } from '@/stores/composer';
import { ENTRANCES_ON, easing, fadeInOnly, riseIn } from '@/theme/motion';
import { fontScaleCap, sizes, spacing, typography } from '@/theme/tokens';

// What the screen needs besides the hero orb, the greeting's words and the tiles:
// header 60 + air around the greeting 40 + gap under the orb 20 + gap above the composer 16
// + composer 120.
const CHROME_HEIGHT = 256;
// Below this much usable height the subtitle goes too (the orb is long gone by then):
// the chrome without the orb's gap (236), the words (102) and two rows of tiles (284).
const HIDE_SUBTITLE_BELOW = 622;

// When the first message is sent, the greeting and tiles fade and drift up 12pt (200ms).
const leave = ENTRANCES_ON
  ? new Keyframe({
      0: { opacity: 1, transform: [{ translateY: 0 }] },
      100: { opacity: 0, transform: [{ translateY: -12 }], easing: easing.exit },
    }).duration(200)
  : undefined;

type EmptyStateProps = {
  /** Space under the floating header. */
  topInset: number;
  inputRef: RefObject<TextInputInstance | null>;
  /** Show the "Create an image" tile. */
  imageGeneration: boolean;
};

/**
 * The hero orb takes the room the screen has left: big on tall phones, smaller on short ones,
 * and gone when there is no room for it (for example iPhone SE, or very large text).
 * The words and the tiles are measured, because they wrap onto more lines with bigger text.
 */
function useHeroOrbSize(wordsHeight: number, tilesHeight: number) {
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The whole window, not the space above the keyboard: the orb must not vanish while typing.
  const usable = height - insets.top - insets.bottom;
  // The composer's line of text grows with the phone's text size.
  const composerGrowth =
    (Math.min(fontScale, fontScaleCap.chrome) - 1) * typography.body.lineHeight;
  // Nothing is measured on the very first frame. The orb comes in right after it.
  const measured = wordsHeight > 0 && tilesHeight > 0;
  const room = Math.floor(usable - CHROME_HEIGHT - composerGrowth - wordsHeight - tilesHeight);
  return {
    orbSize: measured && room >= sizes.orbHeroMin ? Math.min(sizes.orbHeroMax, room) : 0,
    showSubtitle: usable >= HIDE_SUBTITLE_BELOW,
  };
}

/** A new chat: the hero orb and greeting, then the bento tiles right above the composer. */
export function EmptyState({ topInset, inputRef, imageGeneration }: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const [wordsHeight, setWordsHeight] = useState(0);
  const [tilesHeight, setTilesHeight] = useState(0);
  const { orbSize, showSubtitle } = useHeroOrbSize(wordsHeight, tilesHeight);
  const setDraft = useComposerStore((state) => state.setDraft);

  async function handleSuggestion(suggestion: Suggestion) {
    haptics.selection();
    if (suggestion.id === 'summarize') {
      if ((await addDocuments()) > 0) setDraft(suggestion.prefill ?? '');
      return;
    }
    if (suggestion.id === 'photo') {
      if ((await addPhotosFromLibrary()) > 0) inputRef.current?.focus();
      return;
    }
    if (suggestion.prefill) {
      setDraft(suggestion.prefill);
      inputRef.current?.focus();
    }
  }

  return (
    <Animated.View exiting={reduceMotion ? undefined : leave} style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: topInset }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetingArea}>
          <Greeting orbSize={orbSize} showSubtitle={showSubtitle} onWordsHeight={setWordsHeight} />
        </View>

        <View
          style={styles.tiles}
          onLayout={(event) => setTilesHeight(Math.round(event.nativeEvent.layout.height))}
        >
          {suggestionsFor(imageGeneration).map((suggestion, index) => (
            <SuggestionTile
              key={suggestion.id}
              suggestion={suggestion}
              onPress={handleSuggestion}
              entering={
                reduceMotion
                  ? fadeInOnly()
                  : riseIn({
                      distance: 12,
                      delay: 200 + index * 50,
                      duration: 340,
                      fromScale: 0.97,
                    })
              }
            />
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
    // 16pt between the tiles and the composer.
    paddingBottom: spacing.lg,
  },
  greetingArea: {
    // The greeting takes the free space above the tiles and sits in its middle.
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
