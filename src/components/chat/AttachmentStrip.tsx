import { Image } from 'expo-image';
import { FilePdfIcon } from 'phosphor-react-native/src/icons/FilePdf';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { withAlpha } from '@/lib/color';
import { fileUri } from '@/lib/files';
import { fileTypeLabel, formatBytes } from '@/lib/format';
import { popIn, popOut, smoothLayout } from '@/theme/motion';
import { colors, radius, spacing } from '@/theme/tokens';
import type { DraftAttachment } from '@/stores/composer';

const THUMB = 56;
const REMOVE = 20;

type AttachmentStripProps = {
  items: DraftAttachment[];
  onRemove: (id: string) => void;
};

/** The files waiting in the composer: photo thumbnails and document chips, each with ×. */
export function AttachmentStrip({ items, onRemove }: AttachmentStripProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      {items.map((item) => (
        <Animated.View
          key={item.id}
          entering={popIn()}
          exiting={popOut()}
          layout={smoothLayout()}
          style={styles.item}
        >
          {item.kind === 'image' ? <PhotoThumb item={item} /> : <DocumentChip item={item} />}
          {item.status === 'failed' ? (
            <View style={styles.failed} accessibilityLabel="This file could not be added">
              <WarningCircleIcon size={16} color={colors.danger} weight="fill" />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove attachment ${item.name}`}
            hitSlop={12}
            onPress={() => onRemove(item.id)}
            style={styles.remove}
          >
            <XIcon size={11} color={colors.onInk} weight="bold" />
          </Pressable>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

function PhotoThumb({ item }: { item: DraftAttachment }) {
  const uri = item.attachment ? fileUri(item.attachment.path) : item.previewUri;
  return (
    <View style={styles.thumb} accessibilityLabel={`Photo ${item.name}`}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      {item.status === 'preparing' ? (
        <View style={styles.veil}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}

function DocumentChip({ item }: { item: DraftAttachment }) {
  const Icon = item.kind === 'pdf' ? FilePdfIcon : FileTextIcon;
  const size = item.attachment ? formatBytes(item.attachment.size) : '';
  return (
    <View style={styles.chip} accessibilityLabel={`File ${item.name}`}>
      <View style={styles.chipIcon}>
        {item.status === 'preparing' ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Icon size={20} color={colors.accent} weight="fill" />
        )}
      </View>
      <View style={styles.chipText}>
        <AppText variant="titleSm" numberOfLines={1} ellipsizeMode="middle">
          {item.name}
        </AppText>
        <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
          {[fileTypeLabel(item.name), size].filter(Boolean).join(' · ')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingRight: spacing.sm,
  },
  item: {
    // Room for the × button that sits on the corner.
    paddingTop: spacing.xs,
    paddingRight: spacing.xs,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.codeBg,
  },
  veil: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // A 30% white veil while the photo is prepared.
    backgroundColor: withAlpha(colors.surface, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    height: THUMB,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.xs,
    borderCurve: 'continuous',
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    flexShrink: 1,
  },
  remove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: REMOVE,
    height: REMOVE,
    borderRadius: REMOVE / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failed: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
});
