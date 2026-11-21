import { Image } from 'expo-image';
import { router } from 'expo-router';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { PaperclipIcon } from 'phosphor-react-native/src/icons/Paperclip';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { Pressable, Text, View } from 'react-native';

import { DocumentCard } from '@/components/chat/DocumentCard';
import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { retrySend } from '@/chat/engine';
import type { UserMessage } from '@/chat/types';
import { fileUri } from '@/lib/files';
import { makeStyles, useTheme } from '@/theme/theme';
import { fontScaleCap, radius, sizes, spacing, typography } from '@/theme/tokens';

const PHOTO = 120;

type UserMessageViewProps = {
  chatId: string;
  message: UserMessage;
  /** "Tap to retry" is offered only on the last message. */
  isLast: boolean;
};

/**
 * What the user sent: photos and files above a soft gray bubble, on the right. A question asked
 * by voice shows "Voice message…" until the server's transcript arrives. Files sent from another
 * device can't be shown (the server never sends them back), so a small chip counts them.
 */
export function UserMessageView({ chatId, message, isLast }: UserMessageViewProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const photos = message.attachments.filter((file) => file.kind === 'image');
  const documents = message.attachments.filter((file) => file.kind !== 'image');
  const failed = message.status === 'failed';
  const elsewhere = message.attachments.length === 0 ? (message.attachmentCount ?? 0) : 0;
  const listening = message.voice === true && !message.text;

  return (
    <View style={styles.column}>
      {photos.length > 0 ? (
        <View style={styles.photos}>
          {photos.map((photo, index) => (
            <PressableScale
              key={photo.id}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Your photo ${index + 1} of ${photos.length}. Open`}
              pressedScale={0.97}
              onPress={() =>
                router.push({
                  pathname: '/viewer',
                  params: { chatId, messageId: message.id, index: String(index) },
                })
              }
            >
              <Image
                source={{ uri: fileUri(photo.path) }}
                style={styles.photo}
                contentFit="cover"
              />
            </PressableScale>
          ))}
        </View>
      ) : null}

      {documents.map((document) => (
        <DocumentCard key={document.id} attachment={document} />
      ))}

      {elsewhere > 0 ? (
        <View style={styles.chip}>
          <PaperclipIcon size={sizes.icon.action} color={colors.textSecondary} />
          <AppText variant="label" color={colors.textSecondary}>
            {elsewhere === 1 ? '1 attachment' : `${elsewhere} attachments`}
          </AppText>
        </View>
      ) : null}

      {listening ? (
        <View style={styles.bubbleRow}>
          <View style={[styles.bubble, styles.voiceBubble]}>
            <MicrophoneIcon size={sizes.icon.action} color={colors.textSecondary} />
            <AppText variant="body" color={colors.textSecondary}>
              Voice message…
            </AppText>
          </View>
        </View>
      ) : null}

      {message.text ? (
        <View style={styles.bubbleRow}>
          {failed ? (
            <View accessible accessibilityLabel="Not sent">
              <WarningCircleIcon size={20} color={colors.danger} weight="fill" />
            </View>
          ) : null}
          {/* Long-press opens the phone's own text menu (Copy, Share…). */}
          <View style={styles.bubble}>
            <Text selectable maxFontSizeMultiplier={fontScaleCap.message} style={styles.text}>
              {message.text}
            </Text>
          </View>
        </View>
      ) : null}

      {failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Not sent. Tap to retry' : 'Not sent'}
          disabled={!isLast}
          onPress={() => void retrySend(chatId, message.id)}
          hitSlop={8}
        >
          <AppText variant="caption" color={colors.textSecondary}>
            {isLast ? 'Not sent · Tap to retry' : 'Not sent'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  column: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingLeft: '16%',
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bubble: {
    flexShrink: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bubble,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  text: {
    ...typography.body,
    color: colors.text,
  },
  voiceBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.fill,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
}));
