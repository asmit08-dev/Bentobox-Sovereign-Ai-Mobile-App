import { Redirect, router } from 'expo-router';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyError } from '@/api/errors';
import { formatPhone } from '@/auth/phone';
import { CodeInput } from '@/components/auth/CodeInput';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { haptics } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth';
import { makeStyles, useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

const MAX_WIDTH = 420;

/** The time now, updated once a second (for the resend countdown and the expiry). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Sign in, step 2: the code from the SMS. A full code is checked at once. */
export default function VerifyScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const challenge = useAuthStore((state) => state.challenge);
  const now = useNow();
  const inputRef = useRef<TextInputInstance>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  if (!challenge) return <Redirect href="/sign-in" />;

  const expired = now >= challenge.expiresAt;
  const waitSeconds = Math.max(0, Math.ceil((challenge.resendAt - now) / 1000));

  async function check(value: string) {
    if (checking || expired) return;
    setChecking(true);
    setError(null);
    try {
      // On success the route guard swaps this screen for the chat.
      await useAuthStore.getState().verifyCode(value);
      haptics.success();
    } catch (problem) {
      setError(friendlyError(problem));
      setCode('');
      haptics.error();
      inputRef.current?.focus();
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    if (resending || !challenge) return;
    setResending(true);
    setError(null);
    setCode('');
    try {
      await useAuthStore.getState().requestCode(challenge.phone);
      inputRef.current?.focus();
    } catch (problem) {
      setError(friendlyError(problem));
    } finally {
      setResending(false);
    }
  }

  function changeNumber() {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <View style={[styles.top, { paddingTop: insets.top + spacing.xs }]}>
        <IconButton icon={ArrowLeftIcon} label="Back" onPress={changeNumber} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.column}>
          <View style={styles.heading}>
            <AppText variant="display" accessibilityRole="header">
              Enter the code
            </AppText>
            <AppText variant="bodySm" color={colors.textSecondary}>
              {`Sent to ${formatPhone(challenge.phone)}`}
            </AppText>
          </View>

          <CodeInput
            length={challenge.codeLength}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (error) setError(null);
            }}
            onComplete={(value) => void check(value)}
            disabled={expired || checking}
            error={error !== null}
            inputRef={inputRef}
          />

          <View style={styles.status} accessibilityLiveRegion="polite">
            {checking ? <ActivityIndicator color={colors.textSecondary} /> : null}
            {error ? (
              <AppText variant="caption" color={colors.danger}>
                {error}
              </AppText>
            ) : null}
            {expired && !error ? (
              <AppText variant="caption" color={colors.danger}>
                This code expired. Send a new one.
              </AppText>
            ) : null}
          </View>

          {waitSeconds > 0 ? (
            <AppText variant="bodySm" color={colors.textTertiary}>
              {`Resend code in ${clock(waitSeconds)}`}
            </AppText>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={resending}
              onPress={() => void resend()}
              hitSlop={8}
              style={styles.link}
            >
              <AppText variant="button" color={resending ? colors.textTertiary : colors.text}>
                {resending ? 'Sending…' : 'Resend code'}
              </AppText>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={changeNumber}
            hitSlop={8}
            style={styles.link}
          >
            <AppText variant="bodySm" color={colors.textSecondary}>
              Wrong number? <AppText variant="button">Change it</AppText>
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  top: {
    paddingHorizontal: spacing.xs,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: spacing['2xl'],
    paddingHorizontal: spacing.gutter + spacing.sm,
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  status: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  link: {
    alignSelf: 'flex-start',
  },
}));
