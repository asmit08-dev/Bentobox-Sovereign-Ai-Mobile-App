import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SideScroll } from '@/components/markdown/SideScroll';
import { AppText } from '@/components/ui/AppText';
import { haptics } from '@/lib/haptics';
import { copyText } from '@/lib/share';
import {
  colors,
  fontScaleCap,
  hitSlopFor,
  radius,
  sizes,
  spacing,
  typography,
} from '@/theme/tokens';

type CodeBlockProps = {
  code: string;
  language?: string;
};

/** A code block: language label and Copy on top. Code never wraps; it scrolls sideways. */
export function CodeBlock({ code, language }: CodeBlockProps) {
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
          {language ? language.toUpperCase() : 'CODE'}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Code copied' : 'Copy code'}
          hitSlop={hitSlopFor(sizes.icon.action)}
          onPress={handleCopy}
        >
          {copied ? (
            <CheckIcon size={sizes.icon.action} color={colors.success} weight="bold" />
          ) : (
            <CopyIcon size={sizes.icon.action} color={colors.textTertiary} weight="regular" />
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

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.codeBg,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
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
    color: colors.ink,
  },
});
