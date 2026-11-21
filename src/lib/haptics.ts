// The app's haptic map. Use only these.
import * as Haptics from 'expo-haptics';

function play(run: () => Promise<void>) {
  try {
    run().catch(() => {});
  } catch {
    // Haptics are a nice extra. Never let them break a tap.
  }
}

export const haptics = {
  /** Header buttons, Send. */
  light: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Long-press. */
  medium: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Stop. */
  rigid: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** Image ready. */
  soft: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  /** Suggestion tile tap, attachment added. */
  selection: () => play(() => Haptics.selectionAsync()),
  /** Copy. */
  success: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Error. */
  error: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
