// Draws an assistant answer written in Markdown, with the app's text styles.
// `marked` only splits the text into pieces (tokens); every piece is drawn here
// with React Native views, so it works in Expo Go and while text is still streaming.
import * as WebBrowser from 'expo-web-browser';
import { lexer, type Token, type Tokens } from 'marked';
import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { CodeBlock } from '@/components/markdown/CodeBlock';
import { MarkdownTable } from '@/components/markdown/MarkdownTable';
import { makeStyles } from '@/theme/theme';
import { fontScaleCap, fonts, spacing, typography } from '@/theme/tokens';

type Styles = ReturnType<typeof useStyles>;

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

/** Whether the text around a piece is already bold or italic (a heading is bold, for example). */
type Emphasis = { bold: boolean; italic: boolean };

const PLAIN: Emphasis = { bold: false, italic: false };

// Sora keeps bold and italic in separate font files, so emphasis switches the file.
// `fontWeight` and `fontStyle` would be ignored on Android and faked in the web preview.
function faceFor({ bold, italic }: Emphasis) {
  if (bold) return italic ? fonts.semiboldItalic : fonts.semibold;
  return italic ? fonts.italic : fonts.regular;
}

function renderInline(
  styles: Styles,
  tokens: Token[] | undefined,
  key: string,
  emphasis: Emphasis = PLAIN,
): ReactNode[] {
  if (!tokens) return [];
  return tokens.map((token, index) => {
    const id = `${key}.${index}`;
    switch (token.type) {
      case 'text':
        return token.tokens ? (
          <Fragment key={id}>{renderInline(styles, token.tokens, id, emphasis)}</Fragment>
        ) : (
          <Fragment key={id}>{token.text}</Fragment>
        );
      case 'escape':
        return <Fragment key={id}>{token.text}</Fragment>;
      case 'strong':
      case 'em': {
        const inner =
          token.type === 'strong' ? { ...emphasis, bold: true } : { ...emphasis, italic: true };
        return (
          <Text key={id} style={{ fontFamily: faceFor(inner) }}>
            {renderInline(styles, token.tokens, id, inner)}
          </Text>
        );
      }
      case 'del':
        return (
          <Text key={id} style={styles.del}>
            {renderInline(styles, token.tokens, id, emphasis)}
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
            {renderInline(styles, token.tokens, id, emphasis)}
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

// Headings stay in the reading face: a step bigger than the body, in the medium weight, so
// an answer reads as calm text with a clear outline rather than a page of bold.
const HEADING_STYLES: Record<number, TextStyle> = {
  1: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 27, letterSpacing: -0.45 },
  2: { fontFamily: fonts.medium, fontSize: 17.5, lineHeight: 25, letterSpacing: -0.3 },
  3: {
    fontFamily: fonts.medium,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    letterSpacing: -0.15,
  },
};

function Paragraph({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const styles = useStyles();
  return (
    <Text selectable maxFontSizeMultiplier={fontScaleCap.message} style={[styles.body, style]}>
      {children}
    </Text>
  );
}

type MarkdownListProps = {
  styles: Styles;
  list: Tokens.List;
  keyPrefix: string;
  /** The streaming dot: it follows the last word of the last item. */
  trailing?: ReactNode;
};

function MarkdownList({ styles, list, keyPrefix, trailing }: MarkdownListProps) {
  // While streaming, a new bullet arrives before its words do. Its dot then stands alone.
  const renderItem = (item: Tokens.ListItem, key: string, last: boolean) => {
    const blocks = renderBlocks(styles, item.tokens, key, last ? trailing : undefined);
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

function renderBlocks(
  styles: Styles,
  tokens: Token[],
  key: string,
  trailing?: ReactNode,
): ReactNode[] {
  const visible = tokens.filter((token) => token.type !== 'space' && token.type !== 'def');
  return visible.map((token, index) => {
    const id = `${key}.${index}`;
    // The streaming dot goes inside the last paragraph, right after its last word.
    const end = index === visible.length - 1 ? trailing : undefined;
    switch (token.type) {
      case 'heading': {
        const level = Math.min(3, Math.max(1, token.depth));
        return (
          // The heading's words take its medium weight from the paragraph style.
          <Paragraph key={id} style={{ ...HEADING_STYLES[level], ...styles.heading }}>
            {renderInline(styles, token.tokens, id)}
            {end}
          </Paragraph>
        );
      }
      case 'paragraph':
        return (
          <Paragraph key={id}>
            {renderInline(styles, token.tokens, id)}
            {end}
          </Paragraph>
        );
      case 'text':
        return (
          <Paragraph key={id}>
            {token.tokens ? renderInline(styles, token.tokens, id) : token.text}
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
        return (
          <MarkdownList
            key={id}
            styles={styles}
            list={token as Tokens.List}
            keyPrefix={id}
            trailing={end}
          />
        );
      case 'blockquote':
        return (
          <View key={id} style={styles.quote}>
            {renderBlocks(styles, token.tokens ?? [], id, end)}
          </View>
        );
      case 'table':
        return (
          <Fragment key={id}>
            <MarkdownTable
              table={token as Tokens.Table}
              renderInline={(cells, cellKey, emphasis) =>
                renderInline(styles, cells, cellKey, emphasis)
              }
            />
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
  const styles = useStyles();
  const tokens = useMemo(() => lexer(closeOpenFence(text)), [text]);
  const blocks = renderBlocks(styles, tokens, 'md', trailing);
  return <View style={styles.root}>{blocks.length > 0 ? blocks : trailing}</View>;
});

const useStyles = makeStyles(({ colors }) => ({
  root: {
    // 8pt between paragraphs.
    gap: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.text,
    includeFontPadding: false,
  },
  heading: {
    color: colors.text,
    // 16pt above a heading (8 from the gap + 8 here), 4pt below.
    marginTop: spacing.sm,
    marginBottom: -spacing.xs,
  },
  del: {
    textDecorationLine: 'line-through',
  },
  codespan: {
    fontFamily: fonts.mono,
    fontSize: typography.body.fontSize - 2,
    backgroundColor: colors.fill,
  },
  link: {
    color: colors.text,
    textDecorationLine: 'underline',
    textDecorationColor: colors.textTertiary,
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
    color: colors.textSecondary,
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
    // A thin neutral rule marks the quote; the accent is kept for things you can act on.
    borderLeftWidth: 2,
    borderLeftColor: colors.fillStrong,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginVertical: spacing.xs,
  },
}));
