import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { NotePencilIcon } from 'phosphor-react-native/src/icons/NotePencil';
import { XCircleIcon } from 'phosphor-react-native/src/icons/XCircle';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Orb } from '@/components/chat/Orb';
import { RenameDialog } from '@/components/chat/RenameDialog';
import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { Pulse } from '@/components/ui/Pulse';
import type { Chat } from '@/chat/types';
import { ASSISTANT_NAME } from '@/lib/brand';
import { haptics } from '@/lib/haptics';
import { showMenu } from '@/lib/menu';
import { speakableText, stopSpeaking } from '@/lib/speech';
import { HISTORY_SECTIONS, historySection, shortWhen } from '@/lib/time';
import { useChatsStore } from '@/stores/chats';
import { springs } from '@/theme/motion';
import {
  colors,
  fontScaleCap,
  hitSlopFor,
  radius,
  shadows,
  sizes,
  spacing,
  typography,
} from '@/theme/tokens';

// The panel floats: this much canvas shows between it and the screen's edges.
const PANEL_MARGIN = spacing.sm;
const NEW_CHAT_HEIGHT = 40;
// Only the start of a long answer is read to make the preview line.
const PREVIEW_SOURCE_LENGTH = 240;

type HistoryDrawerProps = {
  /** 0 = closed, 1 = open. Shared with the screen, which moves the chat aside. */
  progress: SharedValue<number>;
  open: boolean;
  width: number;
  onClose: () => void;
  onNewChat: () => void;
};

function matches(chat: Chat, query: string) {
  if (chat.title.toLowerCase().includes(query)) return true;
  return chat.messages.some((message) => message.text.toLowerCase().includes(query));
}

/** One line that reminds the user what a chat was about: the latest words, or what was sent. */
function previewOf(chat: Chat) {
  for (let index = chat.messages.length - 1; index >= 0; index--) {
    const message = chat.messages[index];
    const words = speakableText(message.text.slice(0, PREVIEW_SOURCE_LENGTH));
    if (words) return words;
    if (message.role === 'assistant' && message.images.length > 0) {
      return message.images.length === 1 ? 'Picture' : `${message.images.length} pictures`;
    }
    if (message.role === 'user' && message.attachments.length > 0) {
      const first = message.attachments[0];
      return first.kind === 'image' ? 'Photo' : first.name;
    }
  }
  return '';
}

/**
 * The chat history: a floating panel with the assistant's name, New chat, search,
 * and the chats grouped by day in white compartments. It slides in from the left.
 */
export function HistoryDrawer({ progress, open, width, onClose, onNewChat }: HistoryDrawerProps) {
  const insets = useSafeAreaInsets();
  const chats = useChatsStore((state) => state.chats);
  const activeChatId = useChatsStore((state) => state.activeChatId);
  const hydrated = useChatsStore((state) => state.hydrated);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<Chat | undefined>(undefined);

  const search = query.trim().toLowerCase();
  const list = Object.values(chats)
    .filter((chat) => chat.messages.length > 0)
    .filter((chat) => !search || matches(chat, search))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const now = new Date();
  const sections = HISTORY_SECTIONS.map((title) => ({
    title,
    chats: list.filter((chat) => historySection(chat.updatedAt, now) === title),
  })).filter((section) => section.chats.length > 0);
  const showEmpty = hydrated && sections.length === 0;

  // Drag the drawer to the left to close it.
  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-16, 16],
    onUpdate: (event) => {
      'worklet';
      progress.set(Math.min(1, Math.max(0, 1 + event.translationX / width)));
    },
    onDeactivate: (event) => {
      'worklet';
      const close = event.velocityX < -500 || progress.get() < 0.6;
      progress.set(withSpring(close ? 0 : 1, springs.smooth));
      if (close) scheduleOnRN(onClose);
    },
  });

  const panelStyle = useAnimatedStyle(() => ({
    // Closed, the panel waits just off-screen, and its wide shadow would darken the screen's
    // left edge. So it is invisible while closed and solid as soon as it starts to move.
    opacity: interpolate(progress.get(), [0, 0.06], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(progress.get(), [0, 1], [-width - PANEL_MARGIN - 24, 0]) },
    ],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  function openChat(chatId: string) {
    haptics.selection();
    stopSpeaking();
    useChatsStore.getState().openChat(chatId);
    onClose();
  }

  function confirmDelete(chat: Chat) {
    Alert.alert('Delete chat?', `"${chat.title}" will be deleted from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptics.medium();
          useChatsStore.getState().deleteChat(chat.id);
        },
      },
    ]);
  }

  function openRowMenu(chat: Chat) {
    haptics.medium();
    showMenu(
      [
        { label: 'Rename', onPress: () => setRenaming(chat) },
        { label: 'Delete', destructive: true, onPress: () => confirmDelete(chat) },
      ],
      chat.title,
    );
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close chat history"
          onPress={onClose}
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityViewIsModal={open}
          style={[styles.panel, { width }, panelStyle]}
        >
          {/* The shadow sits on the panel; this inner view clips the rows to the round corners.
              The panel floats inside the screen, so its content still has to clear the
              status bar and the home indicator. */}
          <View
            style={[
              styles.panelClip,
              { paddingTop: Math.max(insets.top - PANEL_MARGIN, 0) + spacing.md },
            ]}
          >
            <View style={styles.top}>
              <View style={styles.brand}>
                {/* A still orb: only one orb on screen may move. */}
                <Orb size={sizes.orbAvatar} animated={false} />
                <AppText variant="title" numberOfLines={1} style={styles.brandName}>
                  {ASSISTANT_NAME}
                </AppText>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="New chat"
                  hitSlop={hitSlopFor(NEW_CHAT_HEIGHT)}
                  onPress={() => {
                    haptics.light();
                    onNewChat();
                  }}
                  style={styles.newChat}
                >
                  <NotePencilIcon size={sizes.icon.action} color={colors.onInk} weight="regular" />
                  <AppText variant="label" color={colors.onInk}>
                    New chat
                  </AppText>
                </PressableScale>
              </View>

              <View style={styles.search}>
                <MagnifyingGlassIcon size={sizes.icon.action} color={colors.textTertiary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search chats"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Search chats"
                  returnKeyType="search"
                  autoCorrect={false}
                  maxFontSizeMultiplier={fontScaleCap.chrome}
                  cursorColor={colors.accent}
                  selectionColor={Platform.OS === 'ios' ? colors.accent : colors.accentSoft}
                  style={styles.searchInput}
                />
                {query ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={hitSlopFor(sizes.icon.action)}
                    onPress={() => setQuery('')}
                  >
                    <XCircleIcon
                      size={sizes.icon.action}
                      color={colors.textTertiary}
                      weight="fill"
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <ScrollView
              style={styles.list}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom - PANEL_MARGIN, 0) + spacing.lg },
                showEmpty && styles.listContentEmpty,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {!hydrated ? <SkeletonRows /> : null}

              {showEmpty ? <EmptyHistory searching={search.length > 0} /> : null}

              {sections.map((section) => (
                <View key={section.title} style={styles.section}>
                  <AppText variant="label" color={colors.textSecondary} style={styles.sectionTitle}>
                    {section.title}
                  </AppText>
                  {/* One white compartment per day group. The shadow sits on the outer view,
                    the rounded clip on the inner one. */}
                  <View style={styles.group}>
                    <View style={styles.groupClip}>
                      {section.chats.map((chat, index) => (
                        <ChatRow
                          key={chat.id}
                          chat={chat}
                          active={chat.id === activeChatId}
                          first={index === 0}
                          when={shortWhen(chat.updatedAt, now)}
                          onPress={() => openChat(chat.id)}
                          onLongPress={() => openRowMenu(chat)}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      </GestureDetector>

      {renaming ? (
        <RenameDialog
          key={renaming.id}
          title={renaming.title}
          onCancel={() => setRenaming(undefined)}
          onSave={(title) => {
            useChatsStore.getState().renameChat(renaming.id, title);
            setRenaming(undefined);
          }}
        />
      ) : null}
    </View>
  );
}

type ChatRowProps = {
  chat: Chat;
  active: boolean;
  /** The first row of its group has no line above it. */
  first: boolean;
  when: string;
  onPress: () => void;
  onLongPress: () => void;
};

/** One chat: its name and when it was last used, then a line of its latest words. */
function ChatRow({ chat, active, first, when, onPress, onLongPress }: ChatRowProps) {
  const preview = previewOf(chat);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${chat.title}, ${when}`}
      accessibilityState={{ selected: active }}
      accessibilityHint="Long-press to rename or delete"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        active && styles.activeRow,
        pressed && !active && styles.pressedRow,
      ]}
    >
      {first ? null : <View style={styles.rowLine} />}
      <View style={styles.rowTop}>
        <AppText variant="titleSm" numberOfLines={1} style={styles.rowTitle}>
          {chat.title}
        </AppText>
        <AppText variant="caption" color={colors.textTertiary}>
          {when}
        </AppText>
      </View>
      {preview ? (
        <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
          {preview}
        </AppText>
      ) : null}
    </Pressable>
  );
}

/** No chats yet, or none that match the search. */
function EmptyHistory({ searching }: { searching: boolean }) {
  return (
    <View
      style={[styles.empty, searching && styles.emptySearching]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.emptyMark}>
        {searching ? (
          <MagnifyingGlassIcon size={sizes.icon.header} color={colors.textSecondary} />
        ) : (
          // A still orb: only one orb on screen may move.
          <Orb size={sizes.orbHeroMin} animated={false} />
        )}
      </View>
      <AppText variant="titleSm" style={styles.emptyText}>
        {searching ? 'No matches' : 'No chats yet'}
      </AppText>
      <AppText variant="bodySm" color={colors.textSecondary} style={styles.emptyText}>
        {searching ? 'Try a different word.' : 'Your chats will show up here.'}
      </AppText>
    </View>
  );
}

/** A white compartment of gray lines that shimmer while saved chats load. */
function SkeletonRows() {
  return (
    <View style={[styles.group, styles.skeletonGroup]}>
      <Pulse>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <View key={row} style={[styles.skeleton, { width: `${80 - (row % 3) * 15}%` }]} />
        ))}
      </Pulse>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: colors.scrim,
  },
  panel: {
    position: 'absolute',
    top: PANEL_MARGIN,
    bottom: PANEL_MARGIN,
    left: PANEL_MARGIN,
    // Plain canvas: no glow behind the list, so the labels stay readable.
    backgroundColor: colors.canvas,
    borderRadius: radius['3xl'],
    borderCurve: 'continuous',
    boxShadow: shadows.lifted,
  },
  panelClip: {
    flex: 1,
    borderRadius: radius['3xl'],
    borderCurve: 'continuous',
    // Rows scroll under the rounded corners, not past them.
    overflow: 'hidden',
  },
  top: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  brandName: {
    flex: 1,
  },
  newChat: {
    height: NEW_CHAT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: spacing.md,
    paddingRight: 14,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
  },
  search: {
    height: sizes.iconButton,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchInput: {
    ...typography.bodySm,
    flex: 1,
    color: colors.ink,
    padding: 0,
    // No focus ring in the web preview (see Composer).
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.lg,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    paddingHorizontal: spacing.sm,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.rest,
  },
  groupClip: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    minHeight: sizes.minTouch,
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowLine: {
    position: 'absolute',
    top: 0,
    left: spacing.lg,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
  },
  // The open chat is tinted with the Violet Tint (the "selected" color).
  activeRow: {
    backgroundColor: colors.accentSoft,
  },
  pressedRow: {
    backgroundColor: colors.surfaceTray,
  },
  empty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing['2xl'],
    // Sits a little above the middle, where the eye lands first.
    paddingBottom: spacing['4xl'] * 2,
  },
  // While searching, the keyboard covers the lower half, so the block sits near the top.
  emptySearching: {
    flexGrow: 0,
    justifyContent: 'flex-start',
    paddingTop: spacing['3xl'],
    paddingBottom: 0,
  },
  emptyMark: {
    marginBottom: spacing.md,
  },
  emptyText: {
    textAlign: 'center',
  },
  skeletonGroup: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  skeleton: {
    height: 14,
    marginTop: spacing.lg,
    borderRadius: radius.xs,
    backgroundColor: colors.inkDisabled,
  },
});
