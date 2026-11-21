import { ActivityIndicator, Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const HEIGHT = 52;

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner in place of the label and ignores taps. */
  loading?: boolean;
};

/** The one strong button on a screen: a full-width black pill (white in dark mode). */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: PrimaryButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const off = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && !loading && styles.off,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <AppText variant="button" color={disabled ? colors.textTertiary : colors.onPrimary}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  button: {
    height: HEIGHT,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
  off: {
    backgroundColor: colors.fillStrong,
  },
  pressed: {
    opacity: 0.85,
  },
}));
