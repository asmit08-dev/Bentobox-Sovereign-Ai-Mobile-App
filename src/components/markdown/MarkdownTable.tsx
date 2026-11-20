import type { Tokens } from 'marked';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SideScroll } from '@/components/markdown/SideScroll';
import { makeStyles, useTheme } from '@/theme/theme';
import { fontScaleCap, radius, spacing, typography } from '@/theme/tokens';

type MarkdownTableProps = {
  table: Tokens.Table;
  /** `emphasis` says the cell's own text is already bold (the header row is). */
  renderInline: (
    tokens: Tokens.TableCell['tokens'],
    key: string,
    emphasis?: { bold: boolean; italic: boolean },
  ) => ReactNode[];
};

// The header row's own weight (medium) comes from its style.
const HEADER_EMPHASIS = { bold: false, italic: false };

// Columns can't be measured before drawing, so each column gets a width from its longest cell.
const CHAR_WIDTH = 7.2;
const MIN_COLUMN = 72;
const MAX_COLUMN = 220;

function columnWidths(table: Tokens.Table) {
  return table.header.map((cell, column) => {
    const longest = Math.max(
      cell.text.length,
      ...table.rows.map((row) => row[column]?.text.length ?? 0),
    );
    return Math.min(MAX_COLUMN, Math.max(MIN_COLUMN, longest * CHAR_WIDTH + spacing.lg * 2));
  });
}

/** A markdown table on a quiet card. It scrolls sideways when it is wider than the screen. */
export function MarkdownTable({ table, renderInline }: MarkdownTableProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const widths = columnWidths(table);

  return (
    <SideScroll fadeColor={colors.background}>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          {table.header.map((cell, column) => (
            <View key={column} style={[styles.cell, { width: widths[column] }]}>
              <Text maxFontSizeMultiplier={fontScaleCap.message} style={styles.headerText}>
                {renderInline(cell.tokens, `h${column}`, HEADER_EMPHASIS)}
              </Text>
            </View>
          ))}
        </View>
        {table.rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.row, styles.bodyRow]}>
            {row.map((cell, column) => (
              <View key={column} style={[styles.cell, { width: widths[column] }]}>
                <Text maxFontSizeMultiplier={fontScaleCap.message} style={styles.cellText}>
                  {renderInline(cell.tokens, `r${rowIndex}c${column}`)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </SideScroll>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  table: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  row: {
    flexDirection: 'row',
  },
  headerRow: {
    backgroundColor: colors.codeBg,
  },
  bodyRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  cell: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  headerText: {
    ...typography.label,
    color: colors.text,
  },
  cellText: {
    ...typography.bodySm,
    color: colors.text,
  },
}));
