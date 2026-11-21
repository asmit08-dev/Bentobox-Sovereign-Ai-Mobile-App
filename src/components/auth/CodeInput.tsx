import { useState, type RefObject } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, spacing } from '@/theme/tokens';

const BOX_WIDTH = 48;
const BOX_HEIGHT = 56;

type CodeInputProps = {
  length: number;
  value: string;
  onChange: (value: string) => void;
  /** Called once all the digits are in. */
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<TextInputInstance | null>;
};

/**
 * The sign-in code as a row of boxes, one digit each. One hidden text field takes the typing,
 * so the phone's "code from Messages" suggestion and pasting both work.
 */
export function CodeInput({
  length,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = true,
  inputRef,
}: CodeInputProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete(digits);
  }

  return (
    <Pressable
      accessible={false}
      onPress={() => inputRef?.current?.focus()}
      style={styles.row}
      disabled={disabled}
    >
      {Array.from({ length }, (_, index) => {
        const active = focused && !disabled && index === Math.min(value.length, length - 1);
        return (
          <View
            key={index}
            style={[
              styles.box,
              active && styles.boxActive,
              error && styles.boxError,
              disabled && styles.boxOff,
            ]}
          >
            <AppText variant="display" color={disabled ? colors.textTertiary : colors.text}>
              {value[index] ?? ''}
            </AppText>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        caretHidden
        keyboardAppearance={theme.dark ? 'dark' : 'light'}
        accessibilityLabel={`${length}-digit code`}
        style={styles.hidden}
      />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  box: {
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  boxActive: {
    borderWidth: 1.5,
    borderColor: colors.text,
  },
  boxError: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
  boxOff: {
    backgroundColor: colors.fill,
  },
  // Covers the boxes, so a tap anywhere on them focuses it, but can't be seen.
  hidden: {
    ...StyleSheet.absoluteFill,
    opacity: 0.011,
    color: 'transparent',
    // No focus ring in the web preview.
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
}));
