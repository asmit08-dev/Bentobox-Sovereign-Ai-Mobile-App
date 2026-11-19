import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type MenuOption = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * A native menu: an action sheet on iPhone, a dialog on Android.
 * Keep it to 2 options: Android dialogs fit 3 buttons, and one is Cancel.
 */
export function showMenu(options: MenuOption[], title?: string) {
  if (Platform.OS === 'ios') {
    const labels = [...options.map((option) => option.label), 'Cancel'];
    const destructive = options.findIndex((option) => option.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: labels,
        cancelButtonIndex: labels.length - 1,
        destructiveButtonIndex: destructive === -1 ? undefined : destructive,
      },
      (index) => options[index]?.onPress(),
    );
    return;
  }
  Alert.alert(
    title ?? '',
    undefined,
    [
      { text: 'Cancel', style: 'cancel' },
      ...options.slice(0, 2).map((option) => ({
        text: option.label,
        style: option.destructive ? ('destructive' as const) : ('default' as const),
        onPress: option.onPress,
      })),
    ],
    { cancelable: true },
  );
}
