import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, fontScaleCap, radius, shadows, spacing, typography } from '@/theme/tokens';

type RenameDialogProps = {
  /** The current title, filled into the field. */
  title: string;
  onCancel: () => void;
  onSave: (title: string) => void;
};

/**
 * A small dialog to rename a chat (works the same on iPhone and Android).
 * Mount it only while renaming, so the field always starts from the current title.
 */
export function RenameDialog({ title, onCancel, onSave }: RenameDialogProps) {
  const [value, setValue] = useState(title);
  const trimmed = value.trim();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel" />
        <View style={styles.card} accessibilityViewIsModal>
          <AppText variant="title" accessibilityRole="header">
            Rename chat
          </AppText>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            selectTextOnFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSave(trimmed)}
            placeholder="Chat name"
            placeholderTextColor={colors.textTertiary}
            maxFontSizeMultiplier={fontScaleCap.chrome}
            cursorColor={colors.accent}
            selectionColor={Platform.OS === 'ios' ? colors.accent : colors.accentSoft}
            accessibilityLabel="Chat name"
            style={styles.input}
          />
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={[styles.button, styles.secondary]}
            >
              <AppText variant="label">Cancel</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !trimmed }}
              disabled={!trimmed}
              onPress={() => onSave(trimmed)}
              style={[styles.button, trimmed ? styles.primary : styles.primaryDisabled]}
            >
              <AppText variant="label" color={colors.onInk}>
                Save
              </AppText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing['2xl'],
    backgroundColor: colors.scrim,
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    boxShadow: shadows.lifted,
  },
  input: {
    ...typography.body,
    color: colors.ink,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceTray,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    // No focus ring in the web preview (see Composer).
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  button: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  secondary: {
    backgroundColor: colors.surfaceTray,
  },
  primary: {
    backgroundColor: colors.ink,
  },
  primaryDisabled: {
    backgroundColor: colors.inkDisabled,
  },
});
