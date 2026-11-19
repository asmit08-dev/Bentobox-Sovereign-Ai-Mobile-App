import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import type { RefObject } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import Animated from 'react-native-reanimated';

import { AttachmentStrip } from '@/components/chat/AttachmentStrip';
import { SendButton } from '@/components/chat/SendButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { stopAnswer } from '@/chat/engine';
import type { Attachment } from '@/chat/types';
import { ASSISTANT_NAME } from '@/lib/brand';
import { useComposerStore } from '@/stores/composer';
import { useIsAnswering } from '@/stores/live';
import { fadeIn, smoothLayout } from '@/theme/motion';
import {
  colors,
  fontScaleCap,
  hitSlopFor,
  radius,
  shadows,
  sizes,
  spacing,
  typography,
} from '@/theme/tokens';

const LINE_HEIGHT = typography.body.lineHeight;
const PILL_HEIGHT = 48;

type ComposerProps = {
  /** home: the big card on a new chat. thread: the pill under a conversation. */
  variant: 'home' | 'thread';
  inputRef: RefObject<TextInputInstance | null>;
  onSend: (text: string, attachments: Attachment[]) => void;
  onAttach: () => void;
  /** Opens voice mode. When undefined, the mic is hidden (no speech-to-text). */
  onVoice?: () => void;
};

/**
 * Where the user writes. It holds the draft and the attached files.
 * Send turns into Stop while an answer streams.
 */
export function Composer({ variant, inputRef, onSend, onAttach, onVoice }: ComposerProps) {
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
  const canSend = !answering && !preparing && (message.length > 0 || ready.length > 0);

  function send() {
    if (canSend) onSend(message, ready);
  }

  const input = (
    <TextInput
      ref={inputRef}
      value={draft}
      onChangeText={setDraft}
      placeholder={variant === 'home' ? 'Ask me anything…' : 'Message…'}
      placeholderTextColor={colors.textTertiary}
      accessibilityLabel="Message"
      multiline
      // Web only: a browser text area starts two rows tall. Phones size it from minHeight.
      rows={Platform.OS === 'web' ? 1 : undefined}
      maxFontSizeMultiplier={fontScaleCap.chrome}
      // The caret is Orb Violet. On iOS this color also tints the selection.
      selectionColor={Platform.OS === 'ios' ? colors.accent : colors.accentSoft}
      cursorColor={colors.accent}
      selectionHandleColor={colors.accent}
      style={[styles.input, variant === 'home' ? styles.homeInput : styles.threadInput]}
    />
  );

  const attach = (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Attach a file"
      hitSlop={hitSlopFor(sizes.attachButton)}
      onPress={onAttach}
      style={[styles.round, styles.tinted]}
    >
      <PlusIcon size={sizes.icon.attach} color={colors.ink} weight="regular" />
    </PressableScale>
  );

  const mic = onVoice ? (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Talk to ${ASSISTANT_NAME}`}
      accessibilityHint="Opens voice mode"
      hitSlop={hitSlopFor(sizes.attachButton)}
      onPress={onVoice}
      style={styles.round}
    >
      <MicrophoneIcon size={sizes.icon.attach} color={colors.ink} weight="regular" />
    </PressableScale>
  ) : null;

  const sendButton = (
    <SendButton
      mode={answering ? 'stop' : 'send'}
      enabled={canSend}
      onSend={send}
      onStop={stopAnswer}
    />
  );

  const strip =
    items.length > 0 ? <AttachmentStrip items={items} onRemove={removeAttachment} /> : null;

  if (variant === 'home') {
    return (
      // The tray only shows around the card when files are attached.
      <Animated.View layout={smoothLayout()} style={[styles.tray, strip ? styles.trayOpen : null]}>
        {strip ? <View style={styles.trayStrip}>{strip}</View> : null}
        <View style={styles.card}>
          {input}
          <View style={styles.tools}>
            {attach}
            <View style={styles.toolsEnd}>
              {mic}
              {sendButton}
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={fadeIn()} layout={smoothLayout()} style={styles.thread}>
      {strip}
      <View style={styles.threadRow}>
        <View style={styles.pill}>
          {attach}
          {input}
          {mic}
        </View>
        {sendButton}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tray: {
    borderRadius: radius['2xl'],
    borderCurve: 'continuous',
  },
  trayOpen: {
    padding: 6,
    backgroundColor: colors.surfaceTray,
  },
  trayStrip: {
    paddingHorizontal: spacing.xs,
    paddingBottom: 6,
  },
  card: {
    paddingTop: spacing.lg,
    paddingRight: spacing.md,
    paddingBottom: spacing.md,
    paddingLeft: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    boxShadow: shadows.float,
  },
  input: {
    ...typography.body,
    color: colors.ink,
    padding: 0,
    textAlignVertical: 'top',
    // Focused: no ring (the violet caret is enough). This only matters in the web preview,
    // where a browser draws its ring unless the outline style is set too.
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  homeInput: {
    // One line tall when empty. It grows up to six lines, then scrolls inside.
    minHeight: LINE_HEIGHT,
    maxHeight: LINE_HEIGHT * 6,
    paddingRight: spacing.xs,
  },
  threadInput: {
    flex: 1,
    minHeight: LINE_HEIGHT,
    maxHeight: LINE_HEIGHT * 6,
    // One line of text lines up with the 36pt buttons beside it.
    paddingVertical: (sizes.attachButton - LINE_HEIGHT) / 2,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // The attach circle lines up with the card's left padding, optically.
    marginLeft: -spacing.xs,
  },
  toolsEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  round: {
    width: sizes.attachButton,
    height: sizes.attachButton,
    borderRadius: sizes.attachButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The attach button sits in a soft Tray circle, so it reads as a button on the white card.
  tinted: {
    backgroundColor: colors.surfaceTray,
  },
  thread: {
    gap: spacing.xs,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    minHeight: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    // A pill with one line; a rounded rectangle (24) as it grows.
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    boxShadow: shadows.float,
  },
});
