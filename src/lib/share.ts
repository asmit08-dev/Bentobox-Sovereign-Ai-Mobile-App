import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

export async function copyText(text: string) {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareText(text: string) {
  try {
    await Share.share({ message: text });
  } catch {
    // The user closed the sheet, or sharing is not available.
  }
}

/** Opens the share sheet for a file on the phone. */
export async function shareFile(uri: string, mimeType?: string) {
  try {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType });
  } catch {
    // The user closed the sheet.
  }
}
