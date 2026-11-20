import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SideScroll } from '@/components/markdown/SideScroll';
import { AppText } from '@/components/ui/AppText';
import { haptics } from '@/lib/haptics';
import { copyText } from '@/lib/share';
import { makeStyles, useTheme } from '@/theme/theme';
import { fontScaleCap, hitSlopFor, radius, sizes, spacing, typography } from '@/theme/tokens';

type CodeBlockProps = {
  code: string;
  language?: string;
};

/** A code block: language label and Copy on top. Code never wraps; it scrolls sideways. */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleCopy() {
    if (!(await copyText(code))) return;
    haptics.success();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <AppText variant="micro" color={colors.textTertiary} style={styles.language}>
          {language ? language.toLowerCase() : 'code'}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Code copied' : 'Copy code'}
          hitSlop={hitSlopFor(sizes.icon.action)}
          onPress={handleCopy}
        >
          {copied ? (
            <CheckIcon size={sizes.icon.action - 2} color={colors.text} />
          ) : (
            <CopyIcon size={sizes.icon.action - 2} color={colors.textTertiary} />
          )}
        </Pressable>
      </View>
      <SideScroll fadeColor={colors.codeBg}>
        <Text selectable maxFontSizeMultiplier={fontScaleCap.message} style={styles.code}>
          {code}
        </Text>
      </SideScroll>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  block: {
    backgroundColor: colors.codeBg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  language: {
    flexShrink: 1,
  },
  code: {
    ...typography.mono,
    color: colors.text,
  },
}));
