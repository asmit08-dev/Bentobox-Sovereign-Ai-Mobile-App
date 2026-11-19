import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ActionRow } from '@/components/chat/ActionRow';
import { ErrorBlock } from '@/components/chat/ErrorBlock';
import { ImagePlaceholder, ImageResults } from '@/components/chat/ImageResults';
import { Orb, type OrbMode } from '@/components/chat/Orb';
import { ThinkingBubble } from '@/components/chat/ThinkingBubble';
import { Markdown } from '@/components/markdown/Markdown';
import { AppText } from '@/components/ui/AppText';
import { Pulse } from '@/components/ui/Pulse';
import { regenerateAnswer } from '@/chat/engine';
import type { AssistantMessage } from '@/chat/types';
import { ASSISTANT_NAME } from '@/lib/brand';
import { useLiveAnswerFor } from '@/stores/live';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';

const DOT = 6;

type AssistantMessageViewProps = {
  chatId: string;
  message: AssistantMessage;
  /** The newest answer: its orb moves, and it offers Regenerate and Retry. */
  isLatest: boolean;
  /** Width the answer can use (the screen minus the gutters). */
  contentWidth: number;
};

/**
 * One assistant turn: the orb and the assistant's name on top, then the answer in its
 * white compartment, pictures, notes and actions. The answer gets the full width.
 */
export function AssistantMessageView({
  chatId,
  message,
  isLatest,
  contentWidth,
}: AssistantMessageViewProps) {
  const live = useLiveAnswerFor(message.id);
  const streaming = live !== null;
  const text = live ? live.text : message.text;
  const images = live ? live.images : message.images;
  const phase = live?.phase;

  let orbMode: OrbMode = 'idle';
  if (live) orbMode = phase === 'writing' ? 'streaming' : 'thinking';

  const waiting = live !== null && !text && images.length === 0 && phase !== 'creating_image';
  const finished = !streaming && message.status !== 'error';
  const hasContent = text.length > 0 || images.length > 0;

  function openImage(index: number) {
    router.push({
      pathname: '/viewer',
      params: { chatId, messageId: message.id, index: String(index) },
    });
  }

  return (
    <View style={styles.turn}>
      <View style={styles.speaker}>
        <Orb size={sizes.orbAvatar} animated={isLatest} mode={orbMode} />
        <AppText variant="label">{ASSISTANT_NAME}</AppText>
      </View>

      {waiting && live ? <ThinkingBubble startedAt={live.startedAt} /> : null}

      {text ? (
        <View style={styles.bubble}>
          <Markdown text={text} trailing={streaming ? <StreamingDot /> : undefined} />
        </View>
      ) : null}

      {images.length > 0 ? (
        <ImageResults images={images} maxWidth={contentWidth} onOpen={openImage} />
      ) : null}
      {phase === 'creating_image' ? <ImagePlaceholder /> : null}

      {message.status === 'stopped' && !streaming ? (
        <AppText variant="caption" color={colors.textSecondary} style={styles.note}>
          Stopped
        </AppText>
      ) : null}
      {message.note && message.status === 'done' ? (
        <AppText variant="caption" color={colors.textSecondary} style={styles.note}>
          {message.note}
        </AppText>
      ) : null}
      {message.status === 'error' && !streaming ? (
        <ErrorBlock
          detail={message.note}
          onRetry={isLatest ? () => void regenerateAnswer(chatId, message.id) : undefined}
        />
      ) : null}

      {finished && hasContent ? (
        <ActionRow chatId={chatId} message={message} isLatest={isLatest} />
      ) : null}
    </View>
  );
}

/** The violet dot that pulses at the end of the text while an answer streams. */
function StreamingDot() {
  return (
    <View style={styles.dotBox}>
      <Pulse period={900} minOpacity={0.25}>
        <View style={styles.dot} />
      </Pulse>
    </View>
  );
}

const styles = StyleSheet.create({
  turn: {
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  speaker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // A little more air between the name and the answer than between the answer's own parts.
    marginBottom: spacing.xs,
  },
  bubble: {
    // Hugs short answers; long ones use the full width.
    maxWidth: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    // The corner under the orb is tighter: the answer hangs from the speaker.
    // (No `borderCurve` here: iOS only draws continuous corners when all four are equal.)
    borderTopLeftRadius: radius.xs,
    boxShadow: shadows.rest,
  },
  note: {
    paddingHorizontal: spacing.xs,
  },
  dotBox: {
    width: DOT + spacing.xs,
    height: DOT,
    paddingLeft: spacing.xs,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.accent,
  },
});
