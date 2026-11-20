import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import type { RefObject } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { AttachmentStrip } from '@/components/chat/AttachmentStrip';
import { SendButton, type PrimaryMode } from '@/components/chat/SendButton';
import { stopAnswer } from '@/chat/engine';
import type { Attachment } from '@/chat/types';
import { ASSISTANT_NAME } from '@/lib/brand';
import { useComposerStore } from '@/stores/composer';
import { useIsAnswering } from '@/stores/live';
import { smoothLayout } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { fontScaleCap, hitSlopFor, radius, sizes, spacing, typography } from '@/theme/tokens';

const LINE_HEIGHT = typography.body.lineHeight;

type ComposerProps = {
  /** home: a new chat. thread: under a conversation. Only the placeholder differs. */
  variant: 'home' | 'thread';
  inputRef: RefObject<TextInputInstance | null>;
  onSend: (text: string, attachments: Attachment[]) => void;
  onAttach: () => void;
  /** Opens voice mode. */
  onVoice: () => void;
};

/**
 * Where the user writes: one soft gray card with the text on top and the tools under it.
 * Attached files wait inside the card, above the text. The strong round button on the right
 * opens voice mode while the card is empty (voice bars, no text), sends once there is
 * something to send, and stops an answer while it streams.
 */
export function Composer({ variant, inputRef, onSend, onAttach, onVoice }: ComposerProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();
  const draft = useComposerStore((state) => state.draft);
  const setDraft = useComposerStore((state) => state.setDraft);
  const items = useComposerStore((state) => state.attachments);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const answering = useIsAnswering();

  const message = draft.trim();
  const ready = items.flatMap((item) =>
    item.status === 'ready' && item.attachment ? [item.attachment] : [],
  );
  const preparing = items.some((item) => item.status === 'preparing');
  const hasContent = message.length > 0 || items.length > 0;
  const canSend = !answering && !preparing && (message.length > 0 || ready.length > 0);

  let mode: PrimaryMode = 'speak';
  if (answering) mode = 'stop';
  else if (hasContent) mode = 'send';

  function send() {
    if (canSend) onSend(message, ready);
  }

  return (
    <Animated.View layout={smoothLayout()} style={styles.card}>
      {items.length > 0 ? (
        <View style={styles.strip}>
          <AttachmentStrip items={items} onRemove={removeAttachment} />
        </View>
      ) : null}

      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={setDraft}
        placeholder={variant === 'home' ? 'Ask anything' : `Reply to ${ASSISTANT_NAME}`}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Message"
        multiline
        // Web only: a browser text area starts two rows tall. Phones size it from minHeight.
        rows={Platform.OS === 'web' ? 1 : undefined}
        maxFontSizeMultiplier={fontScaleCap.chrome}
        keyboardAppearance={theme.dark ? 'dark' : 'light'}
        // On iOS this color tints both the caret and the selection.
        selectionColor={Platform.OS === 'ios' ? colors.text : colors.selection}
        cursorColor={colors.text}
        selectionHandleColor={colors.text}
        style={styles.input}
      />

      <View style={styles.tools}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          hitSlop={hitSlopFor(sizes.composerButton)}
          onPress={onAttach}
          style={({ pressed }) => [styles.tool, pressed && styles.toolPressed]}
        >
          <PlusIcon size={sizes.icon.composer} color={colors.text} />
        </Pressable>
        <SendButton
          mode={mode}
          enabled={canSend}
          onSend={send}
          onStop={stopAnswer}
          onSpeak={onVoice}
        />
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, shadows }) => ({
  card: {
    gap: spacing.sm,
    paddingTop: spacing.md + 2,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    boxShadow: shadows.rest,
  },
  strip: {
    paddingHorizontal: spacing.xs,
    marginTop: -spacing.sm,
  },
  input: {
    ...typography.body,
    color: colors.text,
    // One line tall when empty. It grows up to six lines, then scrolls inside.
    minHeight: LINE_HEIGHT,
    maxHeight: LINE_HEIGHT * 6,
    paddingVertical: 0,
    paddingHorizontal: spacing.sm,
    textAlignVertical: 'top',
    // Focused: no ring (the caret is enough). This only matters in the web preview,
    // where a browser draws its ring unless the outline style is set too.
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tool: {
    width: sizes.composerButton,
    height: sizes.composerButton,
    borderRadius: sizes.composerButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fill,
  },
  toolPressed: {
    backgroundColor: colors.fillStrong,
  },
}));
