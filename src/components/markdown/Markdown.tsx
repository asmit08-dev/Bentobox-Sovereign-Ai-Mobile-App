// Draws an assistant answer written in Markdown, with the DESIGN.md text styles.
// `marked` only splits the text into pieces (tokens); every piece is drawn here
// with React Native views, so it works in Expo Go and while text is still streaming.
import * as WebBrowser from 'expo-web-browser';
import { lexer, type Token, type Tokens } from 'marked';
import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { CodeBlock } from '@/components/markdown/CodeBlock';
import { MarkdownTable } from '@/components/markdown/MarkdownTable';
import { colors, fontScaleCap, fonts, spacing, typography } from '@/theme/tokens';

type MarkdownProps = {
  text: string;
  /** Drawn at the very end of the text, for example the streaming dot. */
  trailing?: ReactNode;
};

/**
 * While an answer streams, a code block can be open with no closing ``` yet.
 * Closing it here keeps the half-written code inside its gray box.
 */
function closeOpenFence(text: string) {
  const fences = text.match(/^\s{0,3}(```|~~~)/gm)?.length ?? 0;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

function openLink(href: string) {
  if (/^https?:\/\//i.test(href)) {
    WebBrowser.openBrowserAsync(href).catch(() => {});
  } else if (/^(mailto|tel):/i.test(href)) {
    Linking.openURL(href).catch(() => {});
  }
}

function renderInline(tokens: Token[] | undefined, key: string): ReactNode[] {
  if (!tokens) return [];
  return tokens.map((token, index) => {
    const id = `${key}.${index}`;
    switch (token.type) {
      case 'text':
        return token.tokens ? (
          <Fragment key={id}>{renderInline(token.tokens, id)}</Fragment>
        ) : (
          <Fragment key={id}>{token.text}</Fragment>
        );
      case 'escape':
        return <Fragment key={id}>{token.text}</Fragment>;
      case 'strong':
        return (
          <Text key={id} style={styles.strong}>
            {renderInline(token.tokens, id)}
          </Text>
        );
      case 'em':
        return (
          <Text key={id} style={styles.em}>
            {renderInline(token.tokens, id)}
          </Text>
        );
      case 'del':
        return (
          <Text key={id} style={styles.del}>
            {renderInline(token.tokens, id)}
          </Text>
        );
      case 'codespan':
        // Narrow no-break spaces pad the gray background and stay attached to the code,
        // so a wrapped line never ends in an empty gray box.
        return (
          <Text key={id} style={styles.codespan}>
            {`\u202F${token.text}\u202F`}
          </Text>
        );
      case 'link':
        return (
          <Text
            key={id}
            accessibilityRole="link"
            onPress={() => openLink(token.href)}
            style={styles.link}
          >
            {renderInline(token.tokens, id)}
          </Text>
        );
      case 'image':
        return (
          <Text
            key={id}
            accessibilityRole="link"
            onPress={() => openLink(token.href)}
            style={styles.link}
          >
            {token.text || token.href}
          </Text>
        );
      case 'br':
        return <Fragment key={id}>{'\n'}</Fragment>;
      case 'checkbox':
        return <Fragment key={id}>{token.checked ? '☑ ' : '☐ '}</Fragment>;
      default:
        return <Fragment key={id}>{textOf(token)}</Fragment>;
    }
  });
}

/** The plain text of a token we don't draw in a special way (raw HTML, for example). */
function textOf(token: Token) {
  const { text } = token as { text?: unknown };
  return typeof text === 'string' ? text : '';
}

const HEADING_STYLES: Record<number, TextStyle> = {
  1: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  2: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  3: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
};

function Paragraph({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return (
    <Text selectable maxFontSizeMultiplier={fontScaleCap.message} style={[styles.body, style]}>
      {children}
    </Text>
  );
}

type MarkdownListProps = {
  list: Tokens.List;
  keyPrefix: string;
  /** The streaming dot: it follows the last word of the last item. */
  trailing?: ReactNode;
};

function MarkdownList({ list, keyPrefix, trailing }: MarkdownListProps) {
  // While streaming, a new bullet arrives before its words do. Its dot then stands alone.
  const renderItem = (item: Tokens.ListItem, key: string, last: boolean) => {
    const blocks = renderBlocks(item.tokens, key, last ? trailing : undefined);
    if (blocks.length > 0 || !last) return blocks;
    // One line tall, so the dot sits level with the bullet.
    return <View style={styles.loneTrailing}>{trailing}</View>;
  };
  const start = typeof list.start === 'number' ? list.start : 1;
  // Room for the widest number ("10." needs more than "9."), so every item lines up.
  const digits = String(start + list.items.length - 1).length;
  const markerWidth = list.ordered ? 10 * digits + 6 : 14;
  return (
    <View style={styles.list}>
      {list.items.map((item, index) => (
        <View key={`${keyPrefix}.${index}`} style={styles.listItem}>
          <Text
            maxFontSizeMultiplier={fontScaleCap.message}
            style={[styles.marker, { width: markerWidth }, list.ordered && styles.number]}
          >
            {list.ordered ? `${start + index}.` : '•'}
          </Text>
          <View style={styles.listContent}>
            {renderItem(item, `${keyPrefix}.${index}`, index === list.items.length - 1)}
          </View>
        </View>
      ))}
    </View>
  );
}

function renderBlocks(tokens: Token[], key: string, trailing?: ReactNode): ReactNode[] {
  const visible = tokens.filter((token) => token.type !== 'space' && token.type !== 'def');
  return visible.map((token, index) => {
    const id = `${key}.${index}`;
    // The streaming dot goes inside the last paragraph, right after its last word.
    const end = index === visible.length - 1 ? trailing : undefined;
    switch (token.type) {
      case 'heading': {
        const level = Math.min(3, Math.max(1, token.depth));
        return (
          <Paragraph key={id} style={{ ...HEADING_STYLES[level], ...styles.heading }}>
            {renderInline(token.tokens, id)}
            {end}
          </Paragraph>
        );
      }
      case 'paragraph':
        return (
          <Paragraph key={id}>
            {renderInline(token.tokens, id)}
            {end}
          </Paragraph>
        );
      case 'text':
        return (
          <Paragraph key={id}>
            {token.tokens ? renderInline(token.tokens, id) : token.text}
            {end}
          </Paragraph>
        );
      case 'code':
        return (
          <Fragment key={id}>
            <CodeBlock code={token.text} language={token.lang || undefined} />
            {end}
          </Fragment>
        );
      case 'list':
        return <MarkdownList key={id} list={token as Tokens.List} keyPrefix={id} trailing={end} />;
      case 'blockquote':
        return (
          <View key={id} style={styles.quote}>
            {renderBlocks(token.tokens ?? [], id, end)}
          </View>
        );
      case 'table':
        return (
          <Fragment key={id}>
            <MarkdownTable table={token as Tokens.Table} renderInline={renderInline} />
            {end}
          </Fragment>
        );
      case 'hr':
        return <View key={id} style={styles.rule} />;
      default:
        return (
          <Paragraph key={id}>
            {textOf(token) || token.raw}
            {end}
          </Paragraph>
        );
    }
  });
}

/** Markdown → native views. Re-parses only when the text changes. */
export const Markdown = memo(function Markdown({ text, trailing }: MarkdownProps) {
  const tokens = useMemo(() => lexer(closeOpenFence(text)), [text]);
  const blocks = renderBlocks(tokens, 'md', trailing);
  return <View style={styles.root}>{blocks.length > 0 ? blocks : trailing}</View>;
});

const styles = StyleSheet.create({
  root: {
    // 8pt between paragraphs.
    gap: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.ink,
    includeFontPadding: false,
  },
  heading: {
    color: colors.ink,
    // 12pt above a heading (8 from the gap + 4 here), 4pt below.
    marginTop: spacing.xs,
    marginBottom: -spacing.xs,
  },
  strong: {
    fontFamily: fonts.bold,
  },
  em: {
    fontStyle: 'italic',
  },
  del: {
    textDecorationLine: 'line-through',
  },
  codespan: {
    fontFamily: fonts.mono,
    fontSize: 14,
    backgroundColor: colors.codeBg,
  },
  link: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  list: {
    // 6pt between items.
    gap: 6,
  },
  listItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  marker: {
    ...typography.body,
    color: colors.textTertiary,
    includeFontPadding: false,
  },
  number: {
    textAlign: 'right',
  },
  listContent: {
    flex: 1,
    gap: spacing.xs,
  },
  loneTrailing: {
    height: typography.body.lineHeight,
    justifyContent: 'center',
  },
  quote: {
    gap: spacing.sm,
    paddingLeft: spacing.md,
    // A thin neutral rule marks the quote. Violet stays rare (the One Violet Rule).
    borderLeftWidth: 2,
    borderLeftColor: colors.inkDisabled,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginVertical: spacing.xs,
  },
});
