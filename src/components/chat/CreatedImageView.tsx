import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { CreatedImage } from '@/api/contract';
import { useTheme } from '@/theme/theme';

type CreatedImageViewProps = {
  image: CreatedImage;
  width: number;
  height: number;
};

/**
 * A picture the assistant made. The mock backend sends SVG drawings; the real
 * backend will send image links. Both are drawn here.
 */
export const CreatedImageView = memo(function CreatedImageView({
  image,
  width,
  height,
}: CreatedImageViewProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={image.alt}
      style={[styles.frame, { width, height, backgroundColor: colors.surface }]}
    >
      {image.svg ? (
        <SvgXml xml={image.svg} width={width} height={height} />
      ) : image.url ? (
        <Image source={{ uri: image.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
    </View>
  );
});

/** Width ÷ height of a picture (1 when unknown). */
export function aspectOf(image: { width?: number; height?: number }) {
  return image.width && image.height ? image.width / image.height : 1;
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
});
