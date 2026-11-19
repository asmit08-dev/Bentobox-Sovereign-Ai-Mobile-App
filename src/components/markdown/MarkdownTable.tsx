import type { Tokens } from 'marked';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SideScroll } from '@/components/markdown/SideScroll';
import { colors, fontScaleCap, radius, spacing, typography } from '@/theme/tokens';

type MarkdownTableProps = {
  table: Tokens.Table;
  renderInline: (tokens: Tokens.TableCell['tokens'], key: string) => ReactNode[];
};

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

/** A markdown table. It scrolls sideways when it is wider than the bubble. */
export function MarkdownTable({ table, renderInline }: MarkdownTableProps) {
  const widths = columnWidths(table);

  return (
    <SideScroll fadeColor={colors.surface}>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          {table.header.map((cell, column) => (
            <View key={column} style={[styles.cell, { width: widths[column] }]}>
              <Text maxFontSizeMultiplier={fontScaleCap.message} style={styles.headerText}>
                {renderInline(cell.tokens, `h${column}`)}
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

const styles = StyleSheet.create({
  table: {
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
    backgroundColor: colors.surfaceTray,
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
    color: colors.ink,
  },
  cellText: {
    ...typography.caption,
    color: colors.ink,
  },
});
