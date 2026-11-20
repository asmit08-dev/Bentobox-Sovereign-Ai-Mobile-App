import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { useState, type ReactNode } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { CreatedImage } from '@/api/contract';
import { CreatedImageView, aspectOf } from '@/components/chat/CreatedImageView';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import type { Attachment } from '@/chat/types';
import { withAlpha } from '@/lib/color';
import { fileUri } from '@/lib/files';
import { shareCreatedImage, shareFile } from '@/lib/share';
import { useChatsStore } from '@/stores/chats';
import { springs } from '@/theme/motion';
import { fixed, spacing } from '@/theme/tokens';

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
// A soft black shade at the bottom, so the caption and dots stay readable over any picture.
const SHADE_HEIGHT = 200;
const SHADE_COLORS = [withAlpha(fixed.black, 0), withAlpha(fixed.black, 0.72)] as const;

type Picture =
  | { key: string; kind: 'photo'; attachment: Attachment }
  | { key: string; kind: 'created'; image: CreatedImage };

function usePictures(chatId?: string, messageId?: string): Picture[] {
  const message = useChatsStore((state) =>
    chatId && messageId
      ? state.chats[chatId]?.messages.find((entry) => entry.id === messageId)
      : undefined,
  );
  if (!message) return [];
  if (message.role === 'user') {
    return message.attachments
      .filter((file) => file.kind === 'image')
      .map((attachment) => ({ key: attachment.id, kind: 'photo', attachment }));
  }
  return message.images.map((image) => ({ key: image.id, kind: 'created', image }));
}

/** Full-screen pictures on black: pinch or double-tap to zoom, swipe down to close. */
export default function ViewerScreen() {
  const params = useLocalSearchParams<{ chatId?: string; messageId?: string; index?: string }>();
  const pictures = usePictures(params.chatId, params.messageId);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(() => Math.max(0, Number(params.index) || 0));
  const [zoomed, setZoomed] = useState(false);
  const dismiss = useSharedValue(0);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 - dismiss.get() * 0.8 }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: 1 - dismiss.get() * 2 }));

  const close = () => {
    if (router.canGoBack()) router.back();
  };

  async function share() {
    const picture = pictures[page];
    if (!picture) return;
    if (picture.kind === 'photo') {
      await shareFile(fileUri(picture.attachment.path), picture.attachment.mimeType);
    } else {
      await shareCreatedImage(picture.image);
    }
  }

  function onPageScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  }

  if (pictures.length === 0) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <IconButton icon={XIcon} label="Close" tone="onDark" onPress={close} />
      </View>
    );
  }

  const shown = pictures[Math.min(page, pictures.length - 1)];
  const caption = shown.kind === 'created' ? shown.image.alt : '';

  const renderPicture = (picture: Picture) => (
    <ZoomablePage
      width={width}
      height={height}
      dismiss={dismiss}
      zoomed={zoomed}
      onZoomChange={setZoomed}
      onDismiss={close}
    >
      {picture.kind === 'photo' ? (
        <Image
          source={{ uri: fileUri(picture.attachment.path) }}
          style={{ width, height }}
          contentFit="contain"
          accessibilityLabel={picture.attachment.name}
        />
      ) : (
        <CreatedImageView
          image={picture.image}
          width={width}
          height={Math.min(height, width / aspectOf(picture.image))}
        />
      )}
    </ZoomablePage>
  );

  return (
    <View style={styles.screen}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      {pictures.length === 1 ? (
        renderPicture(pictures[0])
      ) : (
        <FlatList
          data={pictures}
          keyExtractor={(picture) => picture.key}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          initialScrollIndex={Math.min(page, pictures.length - 1)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPageScroll}
          renderItem={({ item }) => renderPicture(item)}
        />
      )}

      <Animated.View
        style={[styles.topBar, { paddingTop: insets.top + spacing.sm }, chromeStyle]}
        pointerEvents="box-none"
      >
        <IconButton icon={XIcon} label="Close image" tone="onDark" onPress={close} />
        <IconButton
          icon={ExportIcon}
          label="Share image"
          tone="onDark"
          onPress={() => void share()}
        />
      </Animated.View>

      {caption || pictures.length > 1 ? (
        <Animated.View
          style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }, chromeStyle]}
          pointerEvents="none"
        >
          <LinearGradient colors={SHADE_COLORS} style={styles.shade} />
          {caption ? (
            // What the assistant made, in its own words. Screen readers get it from the picture.
            <AppText
              variant="bodySm"
              color={withAlpha(fixed.white, 0.86)}
              numberOfLines={3}
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={styles.caption}
            >
              {caption}
            </AppText>
          ) : null}
          {pictures.length > 1 ? (
            <View style={styles.dots}>
              {pictures.map((picture, index) => (
                <View key={picture.key} style={[styles.dot, index === page && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

type ZoomablePageProps = {
  width: number;
  height: number;
  /** 0–1 while the picture is dragged down to close. */
  dismiss: SharedValue<number>;
  zoomed: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
  children: ReactNode;
};

function ZoomablePage({
  width,
  height,
  dismiss,
  zoomed,
  onZoomChange,
  onDismiss,
  children,
}: ZoomablePageProps) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      startScale.set(scale.get());
    },
    onUpdate: (event) => {
      'worklet';
      scale.set(Math.min(MAX_ZOOM, Math.max(1, startScale.get() * event.scale)));
    },
    onDeactivate: () => {
      'worklet';
      const isZoomed = scale.get() > 1.05;
      if (!isZoomed) {
        scale.set(withSpring(1, springs.smooth));
        x.set(withSpring(0, springs.smooth));
        y.set(withSpring(0, springs.smooth));
      }
      scheduleOnRN(onZoomChange, isZoomed);
    },
  });

  // Not zoomed: only a vertical drag counts (it closes the viewer); side swipes change pages.
  // Zoomed: a drag in any direction moves the picture.
  const pan = usePanGesture({
    activeOffsetX: zoomed ? [-8, 8] : undefined,
    activeOffsetY: zoomed ? [-8, 8] : [-10, 10],
    failOffsetX: zoomed ? undefined : [-14, 14],
    onActivate: () => {
      'worklet';
      startX.set(x.get());
      startY.set(y.get());
    },
    onUpdate: (event) => {
      'worklet';
      if (scale.get() > 1.05) {
        x.set(startX.get() + event.translationX);
        y.set(startY.get() + event.translationY);
      } else {
        y.set(event.translationY);
        dismiss.set(Math.min(1, Math.abs(event.translationY) / 320));
      }
    },
    onDeactivate: (event) => {
      'worklet';
      const s = scale.get();
      if (s > 1.05) {
        // Keep the zoomed picture from being dragged off the screen.
        const maxX = (width * (s - 1)) / 2;
        const maxY = (height * (s - 1)) / 2;
        x.set(withSpring(Math.min(maxX, Math.max(-maxX, x.get())), springs.smooth));
        y.set(withSpring(Math.min(maxY, Math.max(-maxY, y.get())), springs.smooth));
        return;
      }
      if (Math.abs(event.translationY) > 120 || Math.abs(event.velocityY) > 900) {
        scheduleOnRN(onDismiss);
      } else {
        y.set(withSpring(0, springs.smooth));
        dismiss.set(withTiming(0, { duration: 160 }));
      }
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      const zoomIn = scale.get() <= 1.05;
      scale.set(withSpring(zoomIn ? DOUBLE_TAP_ZOOM : 1, springs.smooth));
      x.set(withSpring(0, springs.smooth));
      y.set(withSpring(0, springs.smooth));
      scheduleOnRN(onZoomChange, zoomIn);
    },
  });

  const gestures = useSimultaneousGestures(pinch, pan, doubleTap);

  const pictureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={gestures}>
      <View style={[styles.page, { width, height }]}>
        <Animated.View style={pictureStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fixed.black,
  },
  backdrop: {
    backgroundColor: fixed.black,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing['2xl'],
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHADE_HEIGHT,
  },
  caption: {
    textAlign: 'center',
    maxWidth: 320,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(fixed.white, 0.35),
  },
  dotActive: {
    backgroundColor: fixed.white,
  },
});
