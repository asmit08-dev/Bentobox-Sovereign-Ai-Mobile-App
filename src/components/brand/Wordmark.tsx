import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { WORDMARK } from '@/components/brand/logoGeometry';
import { ASSISTANT_NAME } from '@/lib/brand';
import { useTheme } from '@/theme/theme';

// Cut from the client's logo (assets/brand/sovrns-logo.png) by scripts/make-icons.mjs.
const LETTERS = require('@/assets/brand/wordmark-letters.png');
const SWOOSH = require('@/assets/brand/wordmark-swoosh.png');
const TRADEMARK = require('@/assets/brand/wordmark-tm.png');

type WordmarkProps = {
  /** Width in points. The height follows the logo's shape. */
  width: number;
  /** The ™ ring at the name's top right, as on the logo. Only where the logo is large. */
  trademark?: boolean;
};

/**
 * The client's Sovrns logo without its black disc: the name over the gold swoosh. The name
 * takes the theme's mark color (black in light mode, white in dark mode, as on the logo's
 * disc); the swoosh keeps its gold. It is an image, so it keeps its size when the phone's
 * text size changes.
 */
export function Wordmark({ width, trademark = false }: WordmarkProps) {
  const { colors } = useTheme();
  const height = width / WORDMARK.aspect;
  const tm = WORDMARK.trademark;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={ASSISTANT_NAME}
      style={{ width, height }}
    >
      <Image source={SWOOSH} contentFit="contain" style={StyleSheet.absoluteFill} />
      <Image
        source={LETTERS}
        tintColor={colors.mark}
        contentFit="contain"
        style={StyleSheet.absoluteFill}
      />
      {trademark ? (
        // It sits just outside the name's box, above and to the right, as on the logo.
        <Image
          source={TRADEMARK}
          tintColor={colors.mark}
          contentFit="contain"
          style={{
            position: 'absolute',
            left: tm.left * width,
            top: tm.top * width,
            width: tm.width * width,
            height: tm.height * width,
          }}
        />
      ) : null}
    </View>
  );
}
