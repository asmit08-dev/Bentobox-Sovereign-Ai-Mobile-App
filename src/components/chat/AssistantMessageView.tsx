import { router } from 'expo-router';
import { View } from 'react-native';

import { ActionRow } from '@/components/chat/ActionRow';
import { ErrorBlock } from '@/components/chat/ErrorBlock';
import { ImagePlaceholder, ImageResults } from '@/components/chat/ImageResults';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { Markdown } from '@/components/markdown/Markdown';
import { AppText } from '@/components/ui/AppText';
import { Pulse } from '@/components/ui/Pulse';
import { regenerateAnswer } from '@/chat/engine';
import type { AssistantMessage } from '@/chat/types';
import { useLiveAnswerFor } from '@/stores/live';
import { makeStyles, useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

const DOT = 8;

type AssistantMessageViewProps = {
  chatId: string;
  message: AssistantMessage;
  /** The newest answer: it offers Regenerate and Retry. */
  isLatest: boolean;
  /** Width the answer can use (the screen minus the gutters). */
  contentWidth: number;
};

/**
 * One assistant turn: the answer as plain text on the page (no bubble, no avatar),
 * then pictures, notes and the actions. The answer gets the full width.
 */
export function AssistantMessageView({
  chatId,
  message,
  isLatest,
  contentWidth,
}: AssistantMessageViewProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const live = useLiveAnswerFor(message.id);
  const streaming = live !== null;
  const text = live ? live.text : message.text;
  const images = live ? live.images : message.images;
  const phase = live?.phase;

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
      {waiting && live ? <ThinkingIndicator startedAt={live.startedAt} /> : null}

      {text ? (
        <View style={styles.answer}>
          <Markdown text={text} trailing={streaming ? <StreamingDot /> : undefined} />
        </View>
      ) : null}

      {images.length > 0 ? (
        <ImageResults images={images} maxWidth={contentWidth} onOpen={openImage} />
      ) : null}
      {phase === 'creating_image' ? <ImagePlaceholder /> : null}

      {message.status === 'stopped' && !streaming ? (
        <AppText variant="caption" color={colors.textSecondary}>
          Stopped
        </AppText>
      ) : null}
      {message.note && message.status === 'done' ? (
        <AppText variant="caption" color={colors.textSecondary}>
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

/** The dot that pulses at the end of the text while an answer streams. */
function StreamingDot() {
  const styles = useStyles();
  return (
    <View style={styles.dotBox}>
      <Pulse period={900} minOpacity={0.25}>
        <View style={styles.dot} />
      </Pulse>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  turn: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  answer: {
    alignSelf: 'stretch',
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
    backgroundColor: colors.text,
  },
}));
