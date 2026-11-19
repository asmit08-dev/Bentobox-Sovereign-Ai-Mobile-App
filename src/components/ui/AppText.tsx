import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fontScaleCap, typography, type TypographyVariant } from '@/theme/tokens';

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: string;
};

/**
 * Text in one of the DESIGN.md type styles.
 * UI text is capped at 1.3× the phone's text size. Pass `maxFontSizeMultiplier` to change it.
 */
export function AppText({
  variant = 'body',
  color = colors.ink,
  maxFontSizeMultiplier = fontScaleCap.chrome,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[styles.base, typography[variant], { color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    // Android adds extra space above and below custom fonts. Remove it so lineHeight is exact.
    includeFontPadding: false,
  },
});
