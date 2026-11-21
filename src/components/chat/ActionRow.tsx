import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { SpeakerHighIcon } from 'phosphor-react-native/src/icons/SpeakerHigh';
import { SpeakerSlashIcon } from 'phosphor-react-native/src/icons/SpeakerSlash';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { AssistantMessage } from '@/chat/types';
import { haptics } from '@/lib/haptics';
import { copyText } from '@/lib/share';
import { speak, stopSpeaking, useSpeechStore } from '@/lib/speech';
import { fadeIn } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { sizes, spacing } from '@/theme/tokens';

const ICON = sizes.icon.action;
const PRESS_CIRCLE = 34;

type ActionRowProps = {
  message: AssistantMessage;
};

/** Under a finished answer, icons only: Copy and Read aloud (the phone's own voice). */
export function ActionRow({ message }: ActionRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speaking = useSpeechStore((state) => state.speakingId === message.id);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!message.text.trim()) return null;

  async function copy() {
    if (!(await copyText(message.text))) return;
    haptics.success();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  function toggleSpeech() {
    if (speaking) stopSpeaking();
    else void speak(message.id, message.text);
  }

  const items: ReactNode[] = [
    <ActionButton key="copy" label={copied ? 'Copied' : 'Copy answer'} onPress={copy}>
      {copied ? (
        <CheckIcon size={ICON} color={colors.text} />
      ) : (
        <CopyIcon size={ICON} color={colors.textTertiary} />
      )}
    </ActionButton>,
    <ActionButton
      key="speak"
      label={speaking ? 'Stop reading aloud' : 'Read aloud'}
      onPress={toggleSpeech}
    >
      {speaking ? (
        <SpeakerSlashIcon size={ICON} color={colors.text} />
      ) : (
        <SpeakerHighIcon size={ICON} color={colors.textTertiary} />
      )}
    </ActionButton>,
  ];

  return (
    <View style={styles.row}>
      {items.map((item, index) => (
        // The row fades in when the answer arrives, one control after another.
        <Animated.View key={index} entering={fadeIn(160, index * 40)}>
          {item}
        </Animated.View>
      ))}
    </View>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  children: ReactNode;
};

function ActionButton({ label, onPress, children }: ActionButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.button}
    >
      {({ pressed }) => (
        // A soft circle under the finger, smaller than the touch area.
        <View style={[styles.circle, pressed && styles.pressed]}>{children}</View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // The buttons carry their own touch area, so the row starts left of the text
    // and the first icon lines up with the answer's first letter.
    marginLeft: -(sizes.minTouch - ICON) / 2,
    marginTop: -spacing.xs,
  },
  button: {
    width: sizes.minTouch,
    height: sizes.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: PRESS_CIRCLE,
    height: PRESS_CIRCLE,
    borderRadius: PRESS_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.pressed,
  },
}));
