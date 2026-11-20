import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import type { CreatedImage } from '@/api/contract';
import { writeTempFile } from '@/lib/files';

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

/** Shares a picture the assistant made. */
export async function shareCreatedImage(image: CreatedImage) {
  if (image.svg) {
    const uri = writeTempFile(`sovrns-${image.id.slice(-8)}.svg`, image.svg);
    await shareFile(uri, 'image/svg+xml');
  } else if (image.url) {
    await shareText(image.url);
  }
}
