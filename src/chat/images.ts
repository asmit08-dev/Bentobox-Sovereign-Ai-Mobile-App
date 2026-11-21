// The pictures of one question (photos, and PDF pages) as the server wants them: JPEG, base64,
// in order, at most `maxImages` of them, and small enough to go in one request (spec 5.5).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { AskImage } from '@/api/types';
import { SHRINK_QUALITY, fitPictures } from '@/chat/askBody';
import type { Attachment } from '@/chat/types';
import { deleteUri, fileUri, readBase64 } from '@/lib/files';

// Photos are saved at most this long (attachments.ts), so it is the guess for older ones.
const DEFAULT_EDGE = 1568;

type Limits = {
  /** The account's `document_pages_max` (50). */
  maxImages: number;
  /** The account's `image_bytes_max` (4 MB). */
  maxImageBytes: number;
  /** Characters of the rest of the question (its text). */
  otherChars?: number;
};

/** A picture to send. Every shrink starts again from the saved file, so quality isn't lost twice. */
type Picture = { base64: string; uri: string; width: number; height: number };

type Source = { path: string; width?: number; height?: number };

/** The saved pictures to send, in order: photos as they are, PDFs page by page. */
function pictureSources(attachments: Attachment[]): Source[] {
  return attachments.flatMap((attachment) =>
    attachment.kind === 'image'
      ? [{ path: attachment.path, width: attachment.width, height: attachment.height }]
      : (attachment.pages ?? []).map((page) => ({
          path: page.path,
          width: page.width,
          height: page.height,
        })),
  );
}

async function readPicture(source: Source): Promise<Picture | null> {
  try {
    return {
      base64: await readBase64(source.path),
      uri: fileUri(source.path),
      width: source.width ?? DEFAULT_EDGE,
      height: source.height ?? DEFAULT_EDGE,
    };
  } catch {
    return null; // The file was deleted. Send the rest.
  }
}

/** The picture again as a JPEG at quality 0.6, with its longest side at most `edge` px. */
async function shrink(picture: Picture, edge: number): Promise<Picture> {
  const context = ImageManipulator.manipulate(picture.uri, { maxWidth: edge, maxHeight: edge });
  try {
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: SHRINK_QUALITY,
      base64: true,
    });
    image.release();
    // Only the base64 is needed: the temporary file can go.
    deleteUri(result.uri);
    return { ...picture, base64: result.base64 ?? picture.base64 };
  } finally {
    context.release();
  }
}

/**
 * Reads the pictures to send and makes them fit in one request. Returns them with how many
 * were left out: past the account's picture limit, or too big even after shrinking.
 */
export async function prepareImagesForSend(attachments: Attachment[], limits: Limits) {
  const sources = pictureSources(attachments);
  const kept = sources.slice(0, limits.maxImages);
  const pictures = (await Promise.all(kept.map(readPicture))).filter(
    (picture): picture is Picture => picture !== null,
  );
  const fitted = await fitPictures(pictures, {
    edge:
      pictures.length > 0
        ? Math.max(...pictures.map((p) => Math.max(p.width, p.height)))
        : DEFAULT_EDGE,
    otherChars: limits.otherChars ?? 0,
    maxImageBytes: limits.maxImageBytes,
    shrink,
  });
  const images = fitted.pictures.map((picture): AskImage => ({
    media_type: 'image/jpeg',
    base64: picture.base64,
  }));
  return { images, dropped: sources.length - kept.length + fitted.dropped };
}
