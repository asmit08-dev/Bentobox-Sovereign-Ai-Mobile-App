import type { ComponentType } from 'react';
import { Pressable } from 'react-native';

import { withAlpha } from '@/lib/color';
import { haptics } from '@/lib/haptics';
import { makeStyles, useTheme } from '@/theme/theme';
import { fixed, hitSlopFor, sizes } from '@/theme/tokens';

type IconButtonProps = {
  /** A Phosphor icon or one from components/ui/icons. */
  icon: ComponentType<{ size?: number; color?: string }>;
  /** What a screen reader says, for example "Open chat history". */
  label: string;
  onPress: () => void;
  /**
   * plain: just the icon; a soft circle shows under the finger (header, drawer).
   * filled: a quiet gray circle (controls that sit alone, like in voice mode).
   * onDark: a smoky circle with a white icon, for the black picture viewer.
   */
  tone?: 'plain' | 'filled' | 'onDark';
  /** Icon color. Defaults to the theme's text color (white on `onDark`). */
  color?: string;
};

/** A round 44pt icon button. */
export function IconButton({
  icon: Glyph,
  label,
  onPress,
  tone = 'plain',
  color,
}: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const iconColor = color ?? (tone === 'onDark' ? fixed.white : colors.text);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlopFor(sizes.iconButton)}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [styles.button, styles[tone], pressed && styles[PRESSED[tone]]]}
    >
      <Glyph size={sizes.icon.header} color={iconColor} />
    </Pressable>
  );
}

// The style each tone takes under the finger.
const PRESSED = { plain: 'pressed', filled: 'filledPressed', onDark: 'onDarkPressed' } as const;

const useStyles = makeStyles(({ colors }) => ({
  button: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: sizes.iconButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: {},
  filled: {
    backgroundColor: colors.surface,
  },
  onDark: {
    backgroundColor: withAlpha(fixed.white, 0.14),
  },
  pressed: {
    backgroundColor: colors.pressed,
  },
  filledPressed: {
    backgroundColor: colors.fill,
  },
  onDarkPressed: {
    backgroundColor: withAlpha(fixed.white, 0.24),
  },
}));
