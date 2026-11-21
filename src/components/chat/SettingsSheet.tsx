import Constants from 'expo-constants';
import type { Icon } from 'phosphor-react-native';
import { DeviceMobileIcon } from 'phosphor-react-native/src/icons/DeviceMobile';
import { MoonIcon } from 'phosphor-react-native/src/icons/Moon';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SunIcon } from 'phosphor-react-native/src/icons/Sun';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { formatPhone } from '@/auth/phone';
import { Wordmark } from '@/components/brand/Wordmark';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { confirmAction } from '@/lib/dialog';
import { haptics } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth';
import { makeStyles, useSettingsStore, useTheme, type AppearanceChoice } from '@/theme/theme';
import { radius, sizes, spacing } from '@/theme/tokens';

const CHOICES: { value: AppearanceChoice; label: string; icon: Icon }[] = [
  { value: 'system', label: 'System', icon: DeviceMobileIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
];

const SEGMENT_HEIGHT = 64;

type SettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
};

/**
 * Settings: who is signed in, today's questions, how the app looks (System, Light or Dark),
 * Sign out, and which version this is.
 */
export function SettingsSheet({ open, onClose, onClosed }: SettingsSheetProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const appearance = useSettingsStore((state) => state.appearance);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const profile = useAuthStore((state) => state.profile);
  const assistant = useAuthStore((state) => state.assistant);
  const version = Constants.expoConfig?.version;

  // Today's numbers change with every question, so they are fetched again on each open.
  useEffect(() => {
    if (open)
      useAuthStore
        .getState()
        .refreshMe()
        .catch(() => {});
  }, [open]);

  async function confirmSignOut() {
    const confirmed = await confirmAction({
      title: 'Sign out?',
      message: 'Your chats will be removed from this phone.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!confirmed) return;
    haptics.medium();
    onClose();
    void useAuthStore.getState().signOut();
  }

  const usage = assistant
    ? `${assistant.questions_used_today} of ${assistant.questions_per_day} questions used`
    : 'Checking today’s questions…';

  return (
    <BottomSheet open={open} onClose={onClose} onClosed={onClosed} label="Settings">
      <View style={styles.body}>
        <AppText variant="title" accessibilityRole="header">
          Settings
        </AppText>

        <View style={styles.group}>
          <AppText variant="label" color={colors.textTertiary}>
            Account
          </AppText>
          <View style={styles.card}>
            <AppText variant="row" numberOfLines={1}>
              {profile?.name ?? 'Signed in'}
            </AppText>
            {profile?.phone ? (
              <AppText variant="bodySm" color={colors.textSecondary}>
                {formatPhone(profile.phone)}
              </AppText>
            ) : null}
            {profile?.organisation ? (
              <AppText variant="bodySm" color={colors.textSecondary} numberOfLines={2}>
                {profile.organisation}
              </AppText>
            ) : null}
          </View>
        </View>

        <View style={styles.group}>
          <AppText variant="label" color={colors.textTertiary}>
            Today
          </AppText>
          <View style={styles.card} accessibilityLiveRegion="polite">
            <AppText variant="row">{usage}</AppText>
          </View>
        </View>

        <View style={styles.group}>
          <AppText variant="label" color={colors.textTertiary}>
            Appearance
          </AppText>
          <View style={styles.track} accessibilityRole="radiogroup">
            {CHOICES.map((choice) => {
              const selected = appearance === choice.value;
              const Glyph = choice.icon;
              return (
                <Pressable
                  key={choice.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${choice.label} appearance`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    if (selected) return;
                    haptics.selection();
                    setAppearance(choice.value);
                  }}
                  style={[styles.segment, selected && styles.segmentOn]}
                >
                  <Glyph
                    size={sizes.icon.row}
                    color={selected ? colors.text : colors.textTertiary}
                  />
                  <AppText variant="label" color={selected ? colors.text : colors.textSecondary}>
                    {choice.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        >
          <SignOutIcon size={sizes.icon.row} color={colors.danger} />
          <AppText variant="row" color={colors.danger}>
            Sign out
          </AppText>
        </Pressable>

        <View style={styles.about}>
          <Wordmark width={sizes.logo.footer} />
          {version ? (
            <AppText variant="caption" color={colors.textTertiary}>
              {`Version ${version}`}
            </AppText>
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, shadows, dark }) => ({
  body: {
    gap: spacing['2xl'],
    paddingHorizontal: spacing.xs,
  },
  group: {
    gap: spacing.sm + 2,
  },
  card: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  signOut: {
    minHeight: sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  signOutPressed: {
    backgroundColor: colors.pressed,
  },
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  segmentOn: {
    // On a dark sheet the chosen segment is lifted by a lighter gray, not a shadow.
    backgroundColor: dark ? colors.fill : colors.elevated,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.rest,
  },
  about: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
}));
