import { BlurView } from 'expo-blur';
import { ListIcon } from 'phosphor-react-native/src/icons/List';
import { NotePencilIcon } from 'phosphor-react-native/src/icons/NotePencil';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { ASSISTANT_NAME } from '@/lib/brand';
import { duration, fadeIn } from '@/theme/motion';
import { colors, sizes, spacing } from '@/theme/tokens';

type ChatHeaderProps = {
  /** The chat's name. On a new chat there is none, and the header shows the assistant's name. */
  title?: string;
  onOpenHistory: () => void;
  /** Shown only in a chat thread. A new chat is already new. */
  onNewChat?: () => void;
  /** True when content scrolls under the header: the blur fades in. */
  scrolled?: boolean;
};

/** The height of the header, so content can start below it. */
export function useHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + spacing.sm + sizes.iconButton + spacing.sm;
}

/** The top bar: history on the left, the chat name in the middle, New chat on the right. */
export function ChatHeader({ title, onOpenHistory, onNewChat, scrolled = false }: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const shown = title || ASSISTANT_NAME;
  const backdrop = useSharedValue(scrolled ? 1 : 0);

  useEffect(() => {
    backdrop.set(withTiming(scrolled ? 1 : 0, { duration: duration.fast }));
  }, [backdrop, scrolled]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          // Android blur can look muddy, so it uses the plain canvas instead.
          // It is opaque: at 92% the text behind showed through under the title.
          <View style={[StyleSheet.absoluteFill, styles.solid]} />
        )}
        <View style={styles.hairline} />
      </Animated.View>

      <IconButton icon={ListIcon} label="Open chat history" onPress={onOpenHistory} />
      <View style={styles.titleBox}>
        {/* A new name (another chat, or the better title that arrives after the first answer)
            fades in instead of jumping. */}
        <Animated.View key={shown} entering={fadeIn(duration.base)} style={styles.titleFade}>
          <AppText
            variant="title"
            numberOfLines={1}
            // The greeting is the heading of a new chat; there the name is only a label.
            accessibilityRole={title ? 'header' : undefined}
            style={styles.title}
          >
            {shown}
          </AppText>
        </Animated.View>
      </View>
      {onNewChat ? (
        <IconButton icon={NotePencilIcon} label="New chat" onPress={onNewChat} />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  solid: {
    backgroundColor: colors.canvas,
  },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  titleBox: {
    flex: 1,
    alignItems: 'center',
  },
  titleFade: {
    maxWidth: '100%',
  },
  title: {
    textAlign: 'center',
  },
  placeholder: {
    width: sizes.iconButton,
    height: sizes.iconButton,
  },
});
