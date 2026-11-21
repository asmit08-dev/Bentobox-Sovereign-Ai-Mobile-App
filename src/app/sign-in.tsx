import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyError } from '@/api/errors';
import { DEFAULT_COUNTRY_CODE, toE164 } from '@/auth/phone';
import { PhoneField } from '@/components/auth/PhoneField';
import { Wordmark } from '@/components/brand/Wordmark';
import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { haptics } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, sizes, spacing } from '@/theme/tokens';

const PHONE_HINT = 'Enter your number with the country code, like +91 98765 43210.';
const MAX_WIDTH = 420;

/** Sign in, step 1: the phone number. The code comes by SMS (step 2 is verify.tsx). */
export default function SignInScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const notice = useAuthStore((state) => state.notice);
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function edited(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      if (error) setError(null);
      if (notice) useAuthStore.getState().clearNotice();
    };
  }

  async function submit() {
    if (sending) return;
    const phone = toE164(countryCode, number);
    if (!phone) {
      setError(PHONE_HINT);
      haptics.error();
      return;
    }
    setError(null);
    setSending(true);
    try {
      await useAuthStore.getState().requestCode(phone);
      router.push('/verify');
    } catch (problem) {
      setError(friendlyError(problem));
      haptics.error();
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing['4xl'], paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.column}>
          <View style={styles.logo}>
            <Wordmark width={sizes.logo.hero} trademark />
          </View>

          {notice ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <AppText variant="bodySm" color={colors.text}>
                {notice}
              </AppText>
            </View>
          ) : null}

          <View style={styles.heading}>
            <AppText variant="display" accessibilityRole="header">
              Sign in
            </AppText>
            <AppText variant="bodySm" color={colors.textSecondary}>
              {"We'll text you a 6-digit code."}
            </AppText>
          </View>

          <PhoneField
            countryCode={countryCode}
            number={number}
            onChangeCountryCode={edited(setCountryCode)}
            onChangeNumber={edited(setNumber)}
            onSubmit={() => void submit()}
            error={error}
            editable={!sending}
            autoFocus
          />

          <PrimaryButton
            label="Continue"
            onPress={() => void submit()}
            loading={sending}
            disabled={!number.trim()}
          />

          <AppText variant="caption" color={colors.textTertiary} style={styles.footer}>
            No account? Ask your school or organisation to add your number.
          </AppText>
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
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.gutter + spacing.sm,
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    gap: spacing.lg,
  },
  logo: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  notice: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  heading: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  footer: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
}));
