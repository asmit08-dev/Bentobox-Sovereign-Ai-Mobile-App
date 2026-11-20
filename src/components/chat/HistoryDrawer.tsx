import { ChatsCircleIcon } from 'phosphor-react-native/src/icons/ChatsCircle';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { NotePencilIcon } from 'phosphor-react-native/src/icons/NotePencil';
import { XCircleIcon } from 'phosphor-react-native/src/icons/XCircle';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { RenameDialog } from '@/components/chat/RenameDialog';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { Pulse } from '@/components/ui/Pulse';
import type { Chat } from '@/chat/types';
import { haptics } from '@/lib/haptics';
import { showMenu } from '@/lib/menu';
import { stopSpeaking } from '@/lib/speech';
import { HISTORY_SECTIONS, historySection, shortWhen } from '@/lib/time';
import { useChatsStore } from '@/stores/chats';
import { springs } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import {
  fontScaleCap,
  fonts,
  hitSlopFor,
  radius,
  sizes,
  spacing,
  typography,
} from '@/theme/tokens';

const SEARCH_HEIGHT = 40;

type HistoryDrawerProps = {
  /** 0 = closed, 1 = open. Shared with the screen, which slides the chat aside. */
  progress: SharedValue<number>;
  open: boolean;
  width: number;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
};

function matches(chat: Chat, query: string) {
  if (chat.title.toLowerCase().includes(query)) return true;
  return chat.messages.some((message) => message.text.toLowerCase().includes(query));
}

/**
 * The chat history: search and New chat on top, every chat by day, and Settings at the foot.
 * It fills the screen's full height on the left; the chat slides right to uncover it.
 */
export function HistoryDrawer({
  progress,
  open,
  width,
  onClose,
  onNewChat,
  onOpenSettings,
}: HistoryDrawerProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();
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
      style={[styles.panel, { paddingTop: insets.top + spacing.xs }]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <GestureDetector gesture={pan}>
        <View style={styles.fill}>
          <View style={styles.top}>
            <View style={styles.search}>
              <MagnifyingGlassIcon size={sizes.icon.action} color={colors.textTertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Search chats"
                returnKeyType="search"
                autoCorrect={false}
                maxFontSizeMultiplier={fontScaleCap.chrome}
                keyboardAppearance={theme.dark ? 'dark' : 'light'}
                cursorColor={colors.text}
                selectionColor={Platform.OS === 'ios' ? colors.text : colors.selection}
                style={styles.searchInput}
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={hitSlopFor(sizes.icon.action)}
                  onPress={() => setQuery('')}
                >
                  <XCircleIcon size={sizes.icon.action} color={colors.textTertiary} weight="fill" />
                </Pressable>
              ) : null}
            </View>
            <IconButton icon={NotePencilIcon} label="New chat" onPress={onNewChat} />
          </View>

          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.listContent, showEmpty && styles.listContentEmpty]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {!hydrated ? <SkeletonRows /> : null}

            {showEmpty ? <EmptyHistory searching={search.length > 0} /> : null}

            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <AppText variant="label" color={colors.textTertiary} style={styles.sectionTitle}>
                  {section.title}
                </AppText>
                {section.chats.map((chat) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    active={chat.id === activeChatId}
                    when={shortWhen(chat.updatedAt, now)}
                    onPress={() => openChat(chat.id)}
                    onLongPress={() => openRowMenu(chat)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => {
                haptics.selection();
                onOpenSettings();
              }}
              style={({ pressed }) => [styles.footRow, pressed && styles.pressedRow]}
            >
              <GearSixIcon size={sizes.icon.row} color={colors.text} />
              <AppText variant="row">Settings</AppText>
            </Pressable>
          </View>
        </View>
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
  /** When it was last used. Read out by screen readers; the list itself stays quiet. */
  when: string;
  onPress: () => void;
  onLongPress: () => void;
};

/** One chat: its name on one line. The open chat sits on a soft gray pill. */
function ChatRow({ chat, active, when, onPress, onLongPress }: ChatRowProps) {
  const styles = useStyles();
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
      <AppText variant="row" numberOfLines={1} style={active ? styles.activeTitle : undefined}>
        {chat.title}
      </AppText>
    </Pressable>
  );
}

/** No chats yet, or none that match the search. */
function EmptyHistory({ searching }: { searching: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[styles.empty, searching && styles.emptySearching]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.emptyMark}>
        {searching ? (
          <MagnifyingGlassIcon size={sizes.icon.header} color={colors.textTertiary} />
        ) : (
          <ChatsCircleIcon size={sizes.icon.header} color={colors.textTertiary} />
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

/** Gray lines that shimmer where the saved chats will be, while they load. */
function SkeletonRows() {
  const styles = useStyles();
  return (
    <Pulse style={styles.skeletonGroup}>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <View key={row} style={[styles.skeleton, { width: `${78 - (row % 3) * 16}%` }]} />
      ))}
    </Pulse>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  panel: {
    flex: 1,
    backgroundColor: colors.sidebar,
  },
  fill: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingBottom: spacing.md,
  },
  search: {
    flex: 1,
    height: SEARCH_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.fill,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
  searchInput: {
    ...typography.bodySm,
    flex: 1,
    color: colors.text,
    padding: 0,
    // No focus ring in the web preview (see Composer).
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  listContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  section: {
    gap: spacing.xxs,
  },
  sectionTitle: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  row: {
    minHeight: sizes.minTouch - 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  activeRow: {
    backgroundColor: colors.fillStrong,
  },
  activeTitle: {
    fontFamily: fonts.medium,
  },
  pressedRow: {
    backgroundColor: colors.pressed,
  },
  foot: {
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  footRow: {
    minHeight: sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
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
    paddingHorizontal: spacing.md,
    gap: spacing.xl,
    paddingTop: spacing['2xl'],
  },
  skeleton: {
    height: 12,
    borderRadius: radius.xs,
    backgroundColor: colors.fillStrong,
  },
}));
