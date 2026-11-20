import type { Icon } from 'phosphor-react-native';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { ImagesIcon } from 'phosphor-react-native/src/icons/Images';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PressableScale } from '@/components/ui/PressableScale';
import { addDocuments, addPhotoFromCamera, addPhotosFromLibrary } from '@/chat/attachments';
import { haptics } from '@/lib/haptics';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, sizes, spacing } from '@/theme/tokens';

type Choice = {
  label: string;
  hint: string;
  icon: Icon;
  run: () => Promise<number>;
};

const CHOICES: Choice[] = [
  { label: 'Camera', hint: 'Take a new photo', icon: CameraIcon, run: addPhotoFromCamera },
  {
    label: 'Photos',
    hint: 'Choose from your photo library',
    icon: ImagesIcon,
    run: addPhotosFromLibrary,
  },
  { label: 'Files', hint: 'PDF and text files', icon: FileTextIcon, run: addDocuments },
];

const TILE_HEIGHT = 92;

type AttachSheetProps = {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
};

/**
 * The "+" menu: a small sheet that rises from the bottom of the chat screen, over the dimmed
 * chat, with Camera, Photos and Files.
 */
export function AttachSheet({ open, onClose, onClosed }: AttachSheetProps) {
  const styles = useStyles();

  function choose(choice: Choice) {
    haptics.selection();
    // The picker opens from this same tap: a browser only opens its file dialog from a tap.
    choice.run().catch((error: unknown) => console.warn('Could not open the picker.', error));
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} onClosed={onClosed} label="Add a file">
      <View style={styles.tiles}>
        {CHOICES.map((choice) => (
          <Tile key={choice.label} choice={choice} onPress={() => choose(choice)} />
        ))}
      </View>
    </BottomSheet>
  );
}

/** One way to add a file: a soft gray tile with a line icon over its name. */
function Tile({ choice, onPress }: { choice: Choice; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Glyph = choice.icon;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={choice.label}
      accessibilityHint={choice.hint}
      pressedScale={0.96}
      onPress={onPress}
      style={styles.tile}
    >
      <Glyph size={sizes.icon.sheet} color={colors.text} />
      <AppText variant="button">{choice.label}</AppText>
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
}));
