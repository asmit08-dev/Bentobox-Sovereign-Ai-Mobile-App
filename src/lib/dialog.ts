// Small native dialogs: ask before doing something, or say that something went wrong.
// The web preview has its own version (dialog.web.ts), because React Native Web's Alert
// does nothing.
import { Alert } from 'react-native';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
};

/** Asks before doing something. Resolves true when the person confirms. */
export function confirmAction({ title, message, confirmLabel, destructive }: ConfirmOptions) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Tells the person that something didn't work. */
export function showProblem(title: string, message: string) {
  Alert.alert(title, message);
}
