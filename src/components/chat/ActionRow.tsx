import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { SpeakerHighIcon } from 'phosphor-react-native/src/icons/SpeakerHigh';
import { SpeakerSlashIcon } from 'phosphor-react-native/src/icons/SpeakerSlash';
import { ThumbsDownIcon } from 'phosphor-react-native/src/icons/ThumbsDown';
import { ThumbsUpIcon } from 'phosphor-react-native/src/icons/ThumbsUp';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { regenerateAnswer, setFeedback } from '@/chat/engine';
import type { AssistantMessage } from '@/chat/types';
import { haptics } from '@/lib/haptics';
import { copyText } from '@/lib/share';
import { speak, stopSpeaking, useSpeechStore } from '@/lib/speech';
import { fadeIn, springs } from '@/theme/motion';
import { makeStyles, useTheme } from '@/theme/theme';
import { sizes, spacing } from '@/theme/tokens';

const ICON = sizes.icon.action;
const PRESS_CIRCLE = 34;

type ActionRowProps = {
  chatId: string;
  message: AssistantMessage;
  /** Regenerate is only offered on the newest answer. */
  isLatest: boolean;
};

/** Under a finished answer, icons only: Copy, 👍, 👎, Read aloud, and Regenerate (newest only). */
export function ActionRow({ chatId, message, isLatest }: ActionRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speaking = useSpeechStore((state) => state.speakingId === message.id);
  const hasText = message.text.trim().length > 0;
  const { feedback } = message;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    if (!(await copyText(message.text))) return;
    haptics.success();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  function rate(value: 'up' | 'down') {
    haptics.selection();
    setFeedback(chatId, message.id, value);
  }

  function toggleSpeech() {
    if (speaking) stopSpeaking();
    else void speak(message.id, message.text);
  }

  const items: ReactNode[] = [];
  if (hasText) {
    items.push(
      <ActionButton key="copy" label={copied ? 'Copied' : 'Copy answer'} onPress={copy}>
        {copied ? (
          <CheckIcon size={ICON} color={colors.text} />
        ) : (
          <CopyIcon size={ICON} color={colors.textTertiary} />
        )}
      </ActionButton>,
    );
  }
  items.push(
    <ActionButton
      key="up"
      label="Good answer"
      selected={feedback === 'up'}
      dimmed={feedback === 'down'}
      onPress={() => rate('up')}
    >
      <ThumbsUpIcon
        size={ICON}
        color={feedback === 'up' ? colors.text : colors.textTertiary}
        weight={feedback === 'up' ? 'fill' : 'regular'}
      />
    </ActionButton>,
    <ActionButton
      key="down"
      label="Bad answer"
      selected={feedback === 'down'}
      dimmed={feedback === 'up'}
      onPress={() => rate('down')}
    >
      <ThumbsDownIcon
        size={ICON}
        color={feedback === 'down' ? colors.text : colors.textTertiary}
        weight={feedback === 'down' ? 'fill' : 'regular'}
      />
    </ActionButton>,
  );
  if (hasText) {
    items.push(
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
    );
  }
  if (isLatest) {
    items.push(
      <ActionButton
        key="regenerate"
        label="Regenerate answer"
        onPress={() => {
          haptics.light();
          stopSpeaking();
          void regenerateAnswer(chatId, message.id);
        }}
      >
        <ArrowsClockwiseIcon size={ICON} color={colors.textTertiary} />
      </ActionButton>,
    );
  }

  return (
    <View style={styles.row}>
      {items.map((item, index) => (
        // The row fades in when the answer finishes, one control after another.
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
  selected?: boolean;
  /** The other thumb fades to 40% once one is chosen. */
  dimmed?: boolean;
  children: ReactNode;
};

function ActionButton({ label, onPress, selected, dimmed, children }: ActionButtonProps) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const wasSelected = useRef(selected);

  useEffect(() => {
    // A small pop when a thumb is chosen.
    if (selected && !wasSelected.current && !reduceMotion) {
      scale.set(withSequence(withSpring(1.25, springs.bouncy), withSpring(1, springs.bouncy)));
    }
    wasSelected.current = selected;
  }, [reduceMotion, scale, selected]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={[styles.button, dimmed && styles.dimmed]}
    >
      {({ pressed }) => (
        // A soft circle under the finger, smaller than the touch area.
        <View style={[styles.circle, pressed && styles.pressed]}>
          <Animated.View style={popStyle}>{children}</Animated.View>
        </View>
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
  dimmed: {
    opacity: 0.4,
  },
}));
