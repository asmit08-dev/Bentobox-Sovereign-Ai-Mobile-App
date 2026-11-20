import type { RefObject } from 'react';
import { Platform, ScrollView, StyleSheet, type TextInputInstance } from 'react-native';
import Animated, { Keyframe, useReducedMotion } from 'react-native-reanimated';

import { Wordmark } from '@/components/brand/Wordmark';
import { SuggestionRow } from '@/components/chat/SuggestionRow';
import { suggestionsFor, type Suggestion } from '@/components/chat/suggestions';
import { addDocuments, addPhotosFromLibrary } from '@/chat/attachments';
import { haptics } from '@/lib/haptics';
import { useComposerStore } from '@/stores/composer';
import { ENTRANCES_ON, easing, fadeInOnly, riseIn } from '@/theme/motion';
import { sizes, spacing } from '@/theme/tokens';

// When the first message is sent, the logo and suggestions fade and drift up 12pt (200ms).
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
  /** Show the "Create an image" suggestion. */
  imageGeneration: boolean;
  /** Voice mode is on: the suggestions step aside. */
  voice?: boolean;
};

/**
 * A new chat: the logo in the middle of an empty page, and things to try just above the
 * composer. Nothing else competes with the question the user is about to ask.
 */
export function EmptyState({
  topInset,
  inputRef,
  imageGeneration,
  voice = false,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const setDraft = useComposerStore((state) => state.setDraft);
  // The suggestions step aside once the user starts writing or adds a file.
  const idle = useComposerStore(
    (state) => state.draft.length === 0 && state.attachments.length === 0,
  );

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
        <Animated.View
          entering={reduceMotion ? fadeInOnly() : riseIn({ distance: 6, delay: 60, duration: 520 })}
        >
          <Wordmark width={sizes.logo.hero} trademark />
        </Animated.View>
      </ScrollView>

      <SuggestionRow
        suggestions={suggestionsFor(imageGeneration)}
        visible={idle && !voice}
        onPress={(suggestion) => void handleSuggestion(suggestion)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    // The logo sits a little above the middle, where the eye lands first.
    paddingBottom: spacing['4xl'],
  },
});
