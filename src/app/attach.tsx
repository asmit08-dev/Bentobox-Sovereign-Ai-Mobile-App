import { router } from 'expo-router';
import type { Icon } from 'phosphor-react-native';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { ImagesIcon } from 'phosphor-react-native/src/icons/Images';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { addDocuments, addPhotoFromCamera, addPhotosFromLibrary } from '@/chat/attachments';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';

type Row = {
  label: string;
  hint: string;
  icon: Icon;
  run: () => Promise<number>;
};

const ROWS: Row[] = [
  {
    label: 'Photos',
    hint: 'Choose from your photo library',
    icon: ImagesIcon,
    run: addPhotosFromLibrary,
  },
  { label: 'Camera', hint: 'Take a new photo', icon: CameraIcon, run: addPhotoFromCamera },
  { label: 'Files', hint: 'PDF and text files', icon: FileTextIcon, run: addDocuments },
];

/** The attach sheet: Photos, Camera, Files in one white compartment. Nothing else. */
export default function AttachSheet() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  async function choose(row: Row) {
    if (busy) return;
    setBusy(true);
    try {
      await row.run();
    } finally {
      setBusy(false);
      if (router.canGoBack()) router.back();
    }
  }

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
      {/* The shadow sits on the outer view, the rounded clip on the inner one. */}
      <View style={styles.group}>
        <View style={styles.groupClip}>
          {ROWS.map((row, index) => {
            const Glyph = row.icon;
            return (
              <Pressable
                key={row.label}
                accessibilityRole="button"
                accessibilityLabel={`${row.label}. ${row.hint}`}
                disabled={busy}
                onPress={() => void choose(row)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                {index > 0 ? <View style={styles.line} /> : null}
                <View style={styles.icon}>
                  <Glyph size={sizes.icon.header} color={colors.accent} weight="fill" />
                </View>
                <View style={styles.text}>
                  <AppText variant="title">{row.label}</AppText>
                  <AppText variant="caption" color={colors.textTertiary}>
                    {row.hint}
                  </AppText>
                </View>
                <CaretRightIcon size={sizes.icon.chip} color={colors.textTertiary} weight="bold" />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const ICON_SIZE = sizes.iconButton;

const styles = StyleSheet.create({
  sheet: {
    paddingTop: spacing['3xl'],
    paddingHorizontal: spacing.gutter,
    backgroundColor: colors.canvas,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.rest,
  },
  groupClip: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceTray,
  },
  // A hairline between rows. It starts where the text starts.
  line: {
    position: 'absolute',
    top: 0,
    left: spacing.lg + ICON_SIZE + spacing.md,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  // The same violet-tinted square as the suggestion tiles, one size up for a list row.
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
