import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { FilePdfIcon } from 'phosphor-react-native/src/icons/FilePdf';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Attachment } from '@/chat/types';
import { fileUri } from '@/lib/files';
import { fileTypeLabel, formatBytes } from '@/lib/format';
import { shareFile } from '@/lib/share';
import { colors, radius, sizes, spacing } from '@/theme/tokens';

/** A file in the chat: icon, name, "PDF · 2.4 MB", and Share. Tap to open or share it. */
export function DocumentCard({ attachment }: { attachment: Attachment }) {
  const Icon = attachment.kind === 'pdf' ? FilePdfIcon : FileTextIcon;
  const details = [fileTypeLabel(attachment.name), formatBytes(attachment.size)]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${attachment.name}, ${details}`}
      accessibilityHint="Opens the share sheet"
      pressedScale={0.97}
      onPress={() => shareFile(fileUri(attachment.path), attachment.mimeType)}
      style={styles.card}
    >
      <View style={styles.icon}>
        <Icon size={22} color={colors.accent} weight="fill" />
      </View>
      <View style={styles.text}>
        <AppText variant="titleSm" numberOfLines={1} ellipsizeMode="middle">
          {attachment.name}
        </AppText>
        <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
          {details}
        </AppText>
      </View>
      <ExportIcon size={sizes.icon.action} color={colors.textTertiary} weight="regular" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
