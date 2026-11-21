import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
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

import { AttachSheet } from '@/components/chat/AttachSheet';
import { ChatHeader, useHeaderHeight } from '@/components/chat/ChatHeader';
import { Composer } from '@/components/chat/Composer';
import { EmptyState } from '@/components/chat/EmptyState';
import { HistoryDrawer } from '@/components/chat/HistoryDrawer';
import { MessageList } from '@/components/chat/MessageList';
import { SettingsSheet } from '@/components/chat/SettingsSheet';
import { AppText } from '@/components/ui/AppText';
import { HorizonGlow, type GlowMode } from '@/components/voice/HorizonGlow';
import { VoiceDock } from '@/components/voice/VoiceDock';
import { sendMessage } from '@/chat/engine';
import { refreshChats, syncChat } from '@/chat/sync';
import type { Attachment } from '@/chat/types';
import { haptics } from '@/lib/haptics';
import { stopSpeaking } from '@/lib/speech';
import { useFeatures } from '@/stores/auth';
import { useActiveChat, useChatsStore } from '@/stores/chats';
import { useComposerStore } from '@/stores/composer';
import { fadeIn, fadeInOnly, fadeOut, riseIn, springs } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { sizes, spacing } from '@/theme/tokens';

const EDGE_WIDTH = 20;
// Voice mode's light may rise this far up the screen.
const GLOW_SHARE = 0.42;
// After voice mode ends, the light sinks for this long before it is removed.
const GLOW_SINK_MS = 400;
// How much of the scrim shows over the chat while the drawer is open.
const DIM = 0.5;

/** The chat screen: a new chat (greeting and suggestions) or a conversation, with the history drawer. */
export default function ChatScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<TextInputInstance>(null);
  const chat = useActiveChat();
  const features = useFeatures();
  const voiceAvailable = features?.audio_questions === true;
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The "+" sheet: attachOpen is what the user asked for; it stays mounted until it has slid away.
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachMounted, setAttachMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  // Voice mode: the controls take the composer's place and a light rises behind the chat.
  const [voiceOn, setVoiceOn] = useState(false);
  const [glowMode, setGlowMode] = useState<GlowMode>('off');
  const [glowMounted, setGlowMounted] = useState(false);
  const voiceLevel = useSharedValue(0);
  const drawer = useSharedValue(0);
  const drawerWidth = Math.min(Math.round(width * 0.84), sizes.drawerMaxWidth);

  const isEmpty = !chat || chat.messages.length === 0;
  const chatId = chat?.id;
  const closed = chat?.canContinue === false;

  // The chat list, fresh from the server, when the app opens. Offline is fine: the copy shows.
  useEffect(() => {
    refreshChats().catch(() => {});
  }, []);

  // Opening a chat shows the phone's copy at once, then the server's newest messages.
  useEffect(() => {
    if (chatId) syncChat(chatId).catch(() => {});
  }, [chatId]);

  // Once voice mode has ended, the light sinks, then goes away.
  useEffect(() => {
    if (glowMode !== 'off' || !glowMounted) return;
    const timer = setTimeout(() => setGlowMounted(false), GLOW_SINK_MS);
    return () => clearTimeout(timer);
  }, [glowMode, glowMounted]);

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

  // The drawer lies still under the chat. Opening it slides the whole chat to the right, flat,
  // like turning a page aside, so the drawer is readable at every point of the slide.
  // With Reduce Motion nothing slides: the drawer fades in on top instead.
  const chatStyle = useAnimatedStyle(() =>
    reduceMotion ? {} : { transform: [{ translateX: drawer.get() * drawerWidth }] },
  );
  const drawerStyle = useAnimatedStyle(() => (reduceMotion ? { opacity: drawer.get() } : {}));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: drawer.get() * DIM }));

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

  // With the drawer open, dragging the uncovered strip of chat to the left closes it.
  const closePan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-16, 16],
    onUpdate: (event) => {
      'worklet';
      drawer.set(Math.min(1, Math.max(0, 1 + event.translationX / drawerWidth)));
    },
    onDeactivate: (event) => {
      'worklet';
      const close = event.velocityX < -500 || drawer.get() < 0.6;
      drawer.set(withSpring(close ? 0 : 1, springs.smooth));
      if (close) scheduleOnRN(setDrawerOpen, false);
    },
  });

  function handleSend(text: string, attachments: Attachment[]) {
    useComposerStore.getState().clear();
    stopSpeaking();
    void sendMessage(text, attachments);
  }

  function endVoice() {
    setVoiceOn(false);
    setGlowMode('off');
  }

  function openHistory() {
    if (voiceOn) endVoice();
    setDrawerOpen(true);
  }

  function handleNewChat() {
    if (voiceOn) endVoice();
    stopSpeaking();
    useChatsStore.getState().openChat(null);
    setScrolled(false);
    setDrawerOpen(false);
  }

  function handleAttach() {
    Keyboard.dismiss();
    haptics.light();
    setAttachOpen(true);
    setAttachMounted(true);
  }

  function handleSettings() {
    setSettingsOpen(true);
    setSettingsMounted(true);
  }

  function handleVoice() {
    Keyboard.dismiss();
    stopSpeaking();
    setGlowMounted(true);
    setGlowMode('idle');
    setVoiceOn(true);
  }

  const historyDrawer = (
    <Animated.View
      pointerEvents={drawerOpen ? 'auto' : 'none'}
      style={[
        styles.drawer,
        { width: drawerWidth },
        reduceMotion && styles.drawerOnTop,
        drawerStyle,
      ]}
    >
      <HistoryDrawer
        progress={drawer}
        open={drawerOpen}
        width={drawerWidth}
        onClose={() => setDrawerOpen(false)}
        onNewChat={handleNewChat}
        onOpenSettings={handleSettings}
      />
    </Animated.View>
  );

  return (
    <View style={styles.screen}>
      {/* Under the chat, so the chat can slide off it. With Reduce Motion it is drawn last. */}
      {reduceMotion ? null : historyDrawer}

      <Animated.View style={[styles.chat, chatStyle]}>
        {/* Voice mode's light, behind the messages and the controls. */}
        {glowMounted ? (
          <HorizonGlow
            mode={glowMode}
            level={voiceLevel}
            width={width}
            height={Math.round(height * GLOW_SHARE)}
            base={insets.bottom}
          />
        ) : null}

        <View
          style={styles.fill}
          accessibilityElementsHidden={drawerOpen || attachOpen || settingsOpen}
          importantForAccessibility={
            drawerOpen || attachOpen || settingsOpen ? 'no-hide-descendants' : 'auto'
          }
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
                <EmptyState topInset={headerHeight} inputRef={inputRef} voice={voiceOn} />
              ) : (
                <MessageList
                  key={chat.id}
                  chat={chat}
                  topInset={headerHeight}
                  onScrolledChange={setScrolled}
                  fadeEdge={!voiceOn}
                />
              )}
            </View>

            <Animated.View
              entering={
                reduceMotion ? fadeInOnly() : riseIn({ distance: 16, delay: 120, duration: 360 })
              }
              style={[
                styles.composer,
                voiceOn && styles.composerClear,
                { paddingBottom: insets.bottom + spacing.sm },
              ]}
            >
              {voiceOn ? (
                <Animated.View
                  key="voice"
                  entering={
                    reduceMotion ? fadeInOnly() : riseIn({ distance: 24, delay: 80, duration: 420 })
                  }
                  exiting={fadeOut()}
                >
                  <VoiceDock
                    available={voiceAvailable}
                    level={voiceLevel}
                    onGlowChange={setGlowMode}
                    onEnd={endVoice}
                  />
                </Animated.View>
              ) : closed ? (
                <Animated.View key="closed" entering={fadeIn()} exiting={fadeOut()}>
                  <AppText variant="bodySm" color={colors.textSecondary} style={styles.closed}>
                    {"This chat can't continue. Start a new chat."}
                  </AppText>
                </Animated.View>
              ) : (
                <Animated.View key="composer" entering={fadeIn()} exiting={fadeOut()}>
                  <Composer
                    variant={isEmpty ? 'home' : 'thread'}
                    inputRef={inputRef}
                    onSend={handleSend}
                    onAttach={handleAttach}
                    onVoice={handleVoice}
                  />
                </Animated.View>
              )}
            </Animated.View>
          </KeyboardAvoidingView>

          <ChatHeader
            title={isEmpty ? undefined : chat.title}
            scrolled={!isEmpty && scrolled}
            onOpenHistory={openHistory}
            onNewChat={isEmpty ? undefined : handleNewChat}
          />
        </View>

        {drawerOpen ? null : (
          <GestureDetector gesture={edgePan}>
            <View style={[styles.edge, { top: headerHeight }]} />
          </GestureDetector>
        )}

        {/* While the drawer is open the chat dims. Tap or drag this strip to close it. */}
        <GestureDetector gesture={closePan}>
          <Animated.View
            pointerEvents={drawerOpen ? 'auto' : 'none'}
            style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Close chat history"
              accessibilityElementsHidden={!drawerOpen}
              importantForAccessibility={drawerOpen ? 'auto' : 'no-hide-descendants'}
              onPress={() => setDrawerOpen(false)}
            />
          </Animated.View>
        </GestureDetector>
      </Animated.View>

      {reduceMotion ? historyDrawer : null}

      {/* Camera, Photos and Files rise from the bottom of this screen, over the dimmed chat. */}
      {attachMounted ? (
        <AttachSheet
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          onClosed={() => setAttachMounted(false)}
        />
      ) : null}

      {/* Settings rise over the open drawer; closing them goes back to it. */}
      {settingsMounted ? (
        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onClosed={() => setSettingsMounted(false)}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, dark }) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.sidebar,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  chat: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
    // The chat's edge casts a soft shadow onto the drawer as it slides aside.
    boxShadow: dark
      ? '-1px 0px 0px rgba(255, 255, 255, 0.09)'
      : '-1px 0px 0px rgba(0, 0, 0, 0.06), -12px 0px 32px rgba(0, 0, 0, 0.06)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  drawerOnTop: {
    zIndex: 20,
  },
  composer: {
    paddingHorizontal: spacing.gutter - spacing.xs,
    paddingTop: spacing.xs,
    backgroundColor: colors.background,
  },
  // In voice mode the light behind shows through.
  composerClear: {
    backgroundColor: 'transparent',
  },
  edge: {
    position: 'absolute',
    left: 0,
    bottom: 140,
    width: EDGE_WIDTH,
  },
  scrim: {
    backgroundColor: colors.scrim,
  },
  closed: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
}));
