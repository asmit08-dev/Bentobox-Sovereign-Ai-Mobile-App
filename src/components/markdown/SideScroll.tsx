import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { withAlpha } from '@/lib/color';
import { spacing } from '@/theme/tokens';

const FADE_WIDTH = spacing['2xl'];

type SideScrollProps = {
  /** The color the content fades into: the surface the scroller sits on. */
  fadeColor: string;
  children: ReactNode;
};

/**
 * Sideways scrolling for wide code and tables. While more content waits on the right,
 * the right edge fades out, so the cut looks deliberate and invites a swipe.
 */
export function SideScroll({ fadeColor, children }: SideScrollProps) {
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const moreOnRight = content > viewport + 1 && !atEnd;

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    // Same value, no re-render: this only changes when the end is reached or left.
    setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 1);
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setViewport(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => {
          // New or longer content (streaming, or a reused list cell) has more on the right.
          if (width !== content) setAtEnd(false);
          setContent(width);
        }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
      >
        {children}
      </ScrollView>
      {moreOnRight ? (
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(fadeColor, 0), fadeColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fade}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: FADE_WIDTH,
  },
});
