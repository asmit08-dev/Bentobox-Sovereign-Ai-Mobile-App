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
import { makeStyles, useTheme } from '@/theme/theme';
import { fontScaleCap, radius, spacing, typography } from '@/theme/tokens';

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
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();
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
            keyboardAppearance={theme.dark ? 'dark' : 'light'}
            cursorColor={colors.text}
            selectionColor={Platform.OS === 'ios' ? colors.text : colors.selection}
            accessibilityLabel="Chat name"
            style={styles.input}
          />
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.dim]}
            >
              <AppText variant="button">Cancel</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !trimmed }}
              disabled={!trimmed}
              onPress={() => onSave(trimmed)}
              style={({ pressed }) => [
                styles.button,
                trimmed ? styles.primary : styles.primaryDisabled,
                pressed && styles.dim,
              ]}
            >
              <AppText variant="button" color={trimmed ? colors.onPrimary : colors.textTertiary}>
                Save
              </AppText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, shadows }) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing['2xl'],
    backgroundColor: colors.scrim,
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.elevated,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    boxShadow: shadows.lifted,
  },
  input: {
    ...typography.body,
    color: colors.text,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.fill,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryDisabled: {
    backgroundColor: colors.fillStrong,
  },
  dim: {
    opacity: 0.8,
  },
}));
