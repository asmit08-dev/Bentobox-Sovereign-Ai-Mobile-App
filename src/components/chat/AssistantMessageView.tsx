import { View } from 'react-native';

import { ActionRow } from '@/components/chat/ActionRow';
import { ErrorBlock } from '@/components/chat/ErrorBlock';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { Markdown } from '@/components/markdown/Markdown';
import { AppText } from '@/components/ui/AppText';
import { retryAnswer } from '@/chat/engine';
import type { AssistantMessage } from '@/chat/types';
import { useLiveAnswerFor } from '@/stores/live';
import { makeStyles, useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

type AssistantMessageViewProps = {
  chatId: string;
  message: AssistantMessage;
  /** The newest answer: only it offers Retry. */
  isLatest: boolean;
};

/**
 * One assistant turn: the answer as plain text on the page (no bubble, no avatar), then a note
 * and the actions. While the answer is on its way, the breathing "Thinking" dot shows instead.
 */
export function AssistantMessageView({ chatId, message, isLatest }: AssistantMessageViewProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const live = useLiveAnswerFor(message.id);
  const waiting = message.status === 'waiting';

  return (
    <View style={styles.turn}>
      {waiting ? <ThinkingIndicator startedAt={live?.startedAt ?? message.createdAt} /> : null}

      {message.text ? (
        <View style={styles.answer}>
          <Markdown text={message.text} />
        </View>
      ) : null}

      {message.note && message.status === 'done' ? (
        <AppText variant="caption" color={colors.textSecondary}>
          {message.note}
        </AppText>
      ) : null}

      {message.status === 'error' ? (
        <ErrorBlock
          detail={message.note}
          onRetry={isLatest ? () => void retryAnswer(chatId, message.id) : undefined}
        />
      ) : null}

      {message.status === 'done' && message.text ? <ActionRow message={message} /> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  turn: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  answer: {
    alignSelf: 'stretch',
  },
}));
