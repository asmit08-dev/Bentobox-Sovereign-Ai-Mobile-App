import type { Icon } from 'phosphor-react-native';
import { StyleSheet } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { withAlpha } from '@/lib/color';
import { haptics } from '@/lib/haptics';
import { colors, hitSlopFor, shadows, sizes } from '@/theme/tokens';

type IconButtonProps = {
  icon: Icon;
  /** What a screen reader says, for example "Open chat history". */
  label: string;
  onPress: () => void;
  /** "onInk" for dark screens like the image viewer: smoky glass with a white icon. */
  tone?: 'glass' | 'onInk';
};

/** A round glass button for the header: 44pt, white glass, a hairline border and a soft seat. */
export function IconButton({ icon: IconGlyph, label, onPress, tone = 'glass' }: IconButtonProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlopFor(sizes.iconButton)}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={[styles.button, tone === 'onInk' && styles.onInk]}
    >
      <IconGlyph
        size={sizes.icon.header}
        color={tone === 'onInk' ? colors.onInk : colors.ink}
        weight="regular"
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: sizes.iconButton / 2,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.glass,
  },
  onInk: {
    backgroundColor: withAlpha(colors.onInk, 0.14),
    borderColor: withAlpha(colors.onInk, 0.16),
    // On ink there is nothing for a shadow to fall on.
    boxShadow: 'none',
  },
});
