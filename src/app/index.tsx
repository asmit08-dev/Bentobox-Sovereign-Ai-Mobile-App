import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextInputInstance,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useCapabilities } from '@/api/endpoints';
import { ChatHeader, useHeaderHeight } from '@/components/chat/ChatHeader';
import { Composer } from '@/components/chat/Composer';
import { EmptyState } from '@/components/chat/EmptyState';
import { HistoryDrawer } from '@/components/chat/HistoryDrawer';
import { LavenderHaze } from '@/components/chat/LavenderHaze';
import { MessageList } from '@/components/chat/MessageList';
import { sendMessage } from '@/chat/engine';
import type { Attachment } from '@/chat/types';
import { stopSpeaking } from '@/lib/speech';
import { useActiveChat, useChatsStore } from '@/stores/chats';
import { useComposerStore } from '@/stores/composer';
import { fadeInOnly, riseIn, springs } from '@/theme/motion';
import { colors, spacing } from '@/theme/tokens';

const DRAWER_MAX_WIDTH = 352;
const EDGE_WIDTH = 16;

/** The chat screen: a new chat (greeting and tiles) or a conversation, with the history drawer. */
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<TextInputInstance>(null);
  const chat = useActiveChat();
  const capabilities = useCapabilities();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useSharedValue(0);
  const drawerWidth = Math.min(width * 0.84, DRAWER_MAX_WIDTH);

  const isEmpty = !chat || chat.messages.length === 0;

  useEffect(() => {
    drawer.set(withSpring(drawerOpen ? 1 : 0, springs.smooth));
    if (!drawerOpen) return;
    Keyboard.dismiss();
    // Android's back button closes the drawer first.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setDrawerOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [drawer, drawerOpen]);

  // While the drawer is open, the chat behind moves right 24pt and shrinks to 98%.
  const chatStyle = useAnimatedStyle(() =>
    reduceMotion
      ? {}
      : {
          transform: [{ translateX: drawer.get() * 24 }, { scale: 1 - 0.02 * drawer.get() }],
        },
  );

  // A swipe from the left edge pulls the drawer open.
  const edgePan = usePanGesture({
    activeOffsetX: 10,
    failOffsetY: [-16, 16],
    onUpdate: (event) => {
      'worklet';
      drawer.set(Math.min(1, Math.max(0, event.translationX / drawerWidth)));
    },
    onDeactivate: (event) => {
      'worklet';
      const open = event.velocityX > 500 || drawer.get() > 0.4;
      drawer.set(withSpring(open ? 1 : 0, springs.smooth));
      scheduleOnRN(setDrawerOpen, open);
    },
  });

  function handleSend(text: string, attachments: Attachment[]) {
    useComposerStore.getState().clear();
    stopSpeaking();
    void sendMessage(text, attachments);
  }

  function handleNewChat() {
    stopSpeaking();
    useChatsStore.getState().openChat(null);
    setScrolled(false);
    setDrawerOpen(false);
  }

  function handleAttach() {
    Keyboard.dismiss();
    router.push('/attach');
  }

  function handleVoice() {
    Keyboard.dismiss();
    stopSpeaking();
    router.push('/voice');
  }

  return (
    <View style={styles.screen}>
      <LavenderHaze />

      <Animated.View
        style={[styles.fill, chatStyle]}
        accessibilityElementsHidden={drawerOpen}
        importantForAccessibility={drawerOpen ? 'no-hide-descendants' : 'auto'}
      >
        <KeyboardAvoidingView
          style={styles.fill}
          behavior="padding"
          // The composer already keeps the home-indicator space below itself.
          // This offset stops that space from being added twice while the keyboard is open.
          keyboardVerticalOffset={-insets.bottom}
        >
          <View style={styles.fill}>
            {isEmpty ? (
              <EmptyState
                topInset={headerHeight}
                inputRef={inputRef}
                imageGeneration={capabilities.imageGeneration}
              />
            ) : (
              <MessageList
                key={chat.id}
                chat={chat}
                topInset={headerHeight}
                onScrolledChange={setScrolled}
              />
            )}
          </View>

          <Animated.View
            entering={
              reduceMotion ? fadeInOnly() : riseIn({ distance: 16, delay: 120, duration: 360 })
            }
            style={[
              styles.composer,
              // In a thread, the messages fade into plain canvas above the composer.
              // The composer sits on that same canvas, so the haze never shows a seam there.
              !isEmpty && styles.composerOnCanvas,
              { paddingBottom: insets.bottom + spacing.sm },
            ]}
          >
            <Composer
              variant={isEmpty ? 'home' : 'thread'}
              inputRef={inputRef}
              onSend={handleSend}
              onAttach={handleAttach}
              onVoice={capabilities.voiceInput ? handleVoice : undefined}
            />
          </Animated.View>
        </KeyboardAvoidingView>

        <ChatHeader
          title={isEmpty ? undefined : chat.title}
          scrolled={!isEmpty && scrolled}
          onOpenHistory={() => setDrawerOpen(true)}
          onNewChat={isEmpty ? undefined : handleNewChat}
        />
      </Animated.View>

      {drawerOpen ? null : (
        <GestureDetector gesture={edgePan}>
          <View style={[styles.edge, { top: headerHeight }]} />
        </GestureDetector>
      )}

      <HistoryDrawer
        progress={drawer}
        open={drawerOpen}
        width={drawerWidth}
        onClose={() => setDrawerOpen(false)}
        onNewChat={handleNewChat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  fill: {
    flex: 1,
  },
  composer: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
  },
  composerOnCanvas: {
    backgroundColor: colors.canvas,
  },
  edge: {
    position: 'absolute',
    left: 0,
    bottom: 140,
    width: EDGE_WIDTH,
  },
});
