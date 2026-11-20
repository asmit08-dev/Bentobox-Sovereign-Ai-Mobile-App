import { NotePencilIcon } from 'phosphor-react-native/src/icons/NotePencil';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { MenuIcon } from '@/components/ui/icons';
import { duration, fadeIn } from '@/theme/motion';
import { makeStyles } from '@/theme/theme';
import { sizes, spacing } from '@/theme/tokens';

type ChatHeaderProps = {
  /** The chat's name. A new chat has none, and the middle stays empty. */
  title?: string;
  onOpenHistory: () => void;
  /** Shown only in a chat thread. A new chat is already new. */
  onNewChat?: () => void;
  /** True when content scrolls under the header: a solid bar and a hairline fade in. */
  scrolled?: boolean;
};

/** The height of the header, so content can start below it. */
export function useHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + spacing.xs + sizes.iconButton + spacing.xs;
}

/**
 * The top bar: history on the left, the chat's name in the middle, New chat on the right.
 * A new chat leaves the middle empty: the logo is on the page itself.
 */
export function ChatHeader({ title, onOpenHistory, onNewChat, scrolled = false }: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const backdrop = useSharedValue(scrolled ? 1 : 0);

  useEffect(() => {
    backdrop.set(withTiming(scrolled ? 1 : 0, { duration: duration.fast }));
  }, [backdrop, scrolled]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]}>
        <View style={[StyleSheet.absoluteFill, styles.solid]} />
        <View style={styles.hairline} />
      </Animated.View>

      <IconButton icon={MenuIcon} label="Open chat history" onPress={onOpenHistory} />
      <View style={styles.titleBox}>
        {/* A new name (another chat, or the better title that arrives after the first answer)
            fades in instead of jumping. */}
        {title ? (
          <Animated.View key={title} entering={fadeIn(duration.base)} style={styles.titleFade}>
            <AppText
              variant="title"
              numberOfLines={1}
              accessibilityRole="header"
              style={styles.title}
            >
              {title}
            </AppText>
          </Animated.View>
        ) : null}
      </View>
      {onNewChat ? (
        <IconButton icon={NotePencilIcon} label="New chat" onPress={onNewChat} />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  // Opaque: anything thinner lets the text behind show through under the title.
  solid: {
    backgroundColor: colors.background,
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
}));
