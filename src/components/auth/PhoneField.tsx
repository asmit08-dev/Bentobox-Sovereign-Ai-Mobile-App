import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { makeStyles, useTheme } from '@/theme/theme';
import { fontScaleCap, radius, spacing, typography } from '@/theme/tokens';

const HEIGHT = 52;
const CODE_WIDTH = 64;

type PhoneFieldProps = {
  countryCode: string;
  number: string;
  onChangeCountryCode: (value: string) => void;
  onChangeNumber: (value: string) => void;
  /** The keyboard's Done key. */
  onSubmit: () => void;
  /** Shown in red under the field. */
  error?: string | null;
  editable?: boolean;
  autoFocus?: boolean;
};

/** One field in two parts: the country code ("+91") and the number. */
export function PhoneField({
  countryCode,
  number,
  onChangeCountryCode,
  onChangeNumber,
  onSubmit,
  error,
  editable = true,
  autoFocus = false,
}: PhoneFieldProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();
  const shared = {
    editable,
    keyboardType: 'phone-pad' as const,
    maxFontSizeMultiplier: fontScaleCap.chrome,
    keyboardAppearance: theme.dark ? ('dark' as const) : ('light' as const),
    cursorColor: colors.text,
    selectionColor: Platform.OS === 'ios' ? colors.text : colors.selection,
    placeholderTextColor: colors.textTertiary,
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <TextInput
          {...shared}
          value={countryCode}
          onChangeText={onChangeCountryCode}
          maxLength={5}
          accessibilityLabel="Country code"
          style={[styles.input, styles.code]}
        />
        <View style={styles.divider} />
        <TextInput
          {...shared}
          value={number}
          onChangeText={onChangeNumber}
          placeholder="98765 43210"
          autoFocus={autoFocus}
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          maxLength={20}
          accessibilityLabel="Phone number"
          style={[styles.input, styles.number]}
        />
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  wrap: {
    gap: spacing.sm,
  },
  field: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  fieldError: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
  input: {
    ...typography.row,
    fontSize: 16,
    lineHeight: 22,
    height: HEIGHT,
    color: colors.text,
    paddingVertical: 0,
    // No focus ring in the web preview (see Composer).
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  code: {
    width: CODE_WIDTH,
    textAlign: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: HEIGHT / 2,
    backgroundColor: colors.hairline,
  },
  number: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
}));
