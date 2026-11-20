import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/theme';
import { fontScaleCap, typography, type TypographyVariant } from '@/theme/tokens';

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  /** Defaults to the theme's main text color. */
  color?: string;
};

/**
 * Text in one of the app's type styles (see typography in theme/tokens.ts).
 * UI text is capped at 1.3× the phone's text size. Pass `maxFontSizeMultiplier` to change it.
 */
export function AppText({
  variant = 'body',
  color,
  maxFontSizeMultiplier = fontScaleCap.chrome,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[styles.base, typography[variant], { color: color ?? colors.text }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    // Android adds extra space above and below custom fonts. Remove it so lineHeight is exact.
    includeFontPadding: false,
  },
});
