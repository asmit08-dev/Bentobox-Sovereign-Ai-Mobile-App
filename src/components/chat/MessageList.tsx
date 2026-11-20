import { FlashList, useRecyclingState, type FlashListRef } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { AssistantMessageView } from '@/components/chat/AssistantMessageView';
import { ScrollToBottomButton } from '@/components/chat/ScrollToBottomButton';
import { UserMessageView } from '@/components/chat/UserMessageView';
import type { Chat, Message } from '@/chat/types';
import { withAlpha } from '@/lib/color';
import { useLiveStore } from '@/stores/live';
import { fadeInOnly, riseIn } from '@/theme/motion';
import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

// Closer than this to the end counts as "at the bottom".
const BOTTOM_SLACK = 48;
const FADE_HEIGHT = spacing['3xl'];
// A message this young when its row first appears is new: it rises into place.
const FRESH_MS = 1500;

type MessageListProps = {
  chat: Chat;
  /** Space under the floating header. */
  topInset: number;
  /** Tells the header when content scrolls under it (to show its blur). */
  onScrolledChange: (scrolled: boolean) => void;
  /** Messages fade out at the bottom edge. Off in voice mode, where the light rises there. */
  fadeEdge?: boolean;
};

/**
 * A row of the list. A message that was just sent or just started rises 12pt and fades in
 * (the answer a moment after the question). Older messages are simply there.
 */
function MessageRow({ message, children }: { message: Message; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  // The moment this row first showed this message. The list reuses rows for other messages,
  // so the time is taken again whenever the message changes.
  const [shownAt] = useRecyclingState(() => Date.now(), [message.id]);
  const fresh = shownAt - message.createdAt < FRESH_MS;
  const delay = message.role === 'assistant' ? 80 : 0;

  return (
    <Animated.View
      // An entrance only plays when a view is built. A new message in a reused row gets its
      // own key, so its view is built anew and the entrance plays there too.
      key={fresh ? message.id : 'steady'}
      entering={fresh ? (reduceMotion ? fadeInOnly() : riseIn({ distance: 12, delay })) : undefined}
    >
      {children}
    </Animated.View>
  );
}

function latestAssistantId(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') return messages[index].id;
  }
  return undefined;
}

/**
 * The conversation. New messages appear at the bottom. While an answer streams,
 * the list follows it, but only if the user is already at the bottom.
 */
export function MessageList({
  chat,
  topInset,
  onScrolledChange,
  fadeEdge = true,
}: MessageListProps) {
  const { colors } = useTheme();
  const listRef = useRef<FlashListRef<Message>>(null);
  const { width } = useWindowDimensions();
  const streamingHere = useLiveStore((state) => state.answer?.chatId === chat.id);
  const [showJump, setShowJump] = useState(false);
  const atBottom = useRef(true);
  // True while the user's finger moves the list (a drag, or the glide after it).
  const userScrolling = useRef(false);
  const lastOffset = useRef(0);
  const scrolled = useRef(false);

  const { messages } = chat;
  const lastId = messages[messages.length - 1]?.id;
  const latestAnswerId = latestAssistantId(messages);
  // What an answer can use: the screen minus the gutters.
  const contentWidth = width - spacing.gutter * 2;

  // A new message (sent, or sent again) always brings the view down to it.
  useEffect(() => {
    atBottom.current = true;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [lastId]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
    // Moving up is always the user: streaming and scrollToEnd only ever move down.
    // This also catches a mouse wheel or trackpad, which send no drag events.
    const movedUp = contentOffset.y < lastOffset.current - 1;
    lastOffset.current = contentOffset.y;
    // Only the user can leave the bottom. While an answer streams, the content grows
    // between scroll events, so a scroll event alone must not stop the list following it.
    if (distance < BOTTOM_SLACK) atBottom.current = true;
    else if (userScrolling.current || movedUp) atBottom.current = false;
    // The jump button appears when the latest message is more than a screen away.
    const jump = distance > layoutMeasurement.height;
    setShowJump((current) => (current === jump ? current : jump));
    const under = contentOffset.y > 4;
    if (under !== scrolled.current) {
      scrolled.current = under;
      onScrolledChange(under);
    }
  }

  function followStream() {
    if (atBottom.current) listRef.current?.scrollToEnd({ animated: false });
  }

  return (
    <View style={styles.fill}>
      <FlashList
        ref={listRef}
        data={messages}
        keyExtractor={(message) => message.id}
        getItemType={(message) => message.role}
        extraData={`${latestAnswerId}|${lastId}|${contentWidth}`}
        renderItem={({ item, index }) => (
          <View style={[styles.item, index > 0 && styles.spaced]}>
            <MessageRow message={item}>
              {item.role === 'user' ? (
                <UserMessageView chatId={chat.id} message={item} isLast={item.id === lastId} />
              ) : (
                <AssistantMessageView
                  chatId={chat.id}
                  message={item}
                  isLatest={item.id === latestAnswerId}
                  contentWidth={contentWidth}
                />
              )}
            </MessageRow>
          </View>
        )}
        maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
        contentContainerStyle={{ paddingTop: topInset + spacing.lg, paddingBottom: FADE_HEIGHT }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => {
          userScrolling.current = true;
        }}
        onScrollEndDrag={() => {
          userScrolling.current = false;
        }}
        onMomentumScrollBegin={() => {
          userScrolling.current = true;
        }}
        onMomentumScrollEnd={() => {
          userScrolling.current = false;
        }}
        onContentSizeChange={followStream}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {/* Messages fade under the composer instead of being cut. */}
      {fadeEdge ? (
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(colors.background, 0), colors.background]}
          style={styles.fade}
        />
      ) : null}

      {showJump ? (
        <View style={styles.jump} pointerEvents="box-none">
          <ScrollToBottomButton
            streaming={streamingHere}
            onPress={() => {
              atBottom.current = true;
              listRef.current?.scrollToEnd({ animated: true });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  item: {
    paddingHorizontal: spacing.gutter,
  },
  spaced: {
    // 24pt between turns.
    paddingTop: spacing['2xl'],
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: FADE_HEIGHT,
  },
  jump: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: 'center',
  },
});
