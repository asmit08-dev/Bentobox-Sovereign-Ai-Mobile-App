// Adding photos and documents to the composer.
// Photos are always shrunk and turned into JPEG (iPhones take HEIC, which the AI can't read).
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { Attachment, AttachmentKind } from '@/chat/types';
import { deleteFile, keepFile } from '@/lib/files';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { MAX_ATTACHMENTS, useComposerStore, type DraftAttachment } from '@/stores/composer';

// The longest side of a photo we send. Bigger photos cost more and are not read better.
const MAX_IMAGE_EDGE = 1568;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;

const TEXT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'text/comma-separated-values',
  'application/json',
];
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'json'];

function slotsLeft() {
  const left = MAX_ATTACHMENTS - useComposerStore.getState().attachments.length;
  if (left <= 0) {
    Alert.alert('Too many files', `You can add up to ${MAX_ATTACHMENTS} files to one message.`);
  }
  return left;
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Shrinks a photo, turns it into JPEG and saves it. */
async function preparePhoto(uri: string, id: string, name: string): Promise<Attachment> {
  const context = ImageManipulator.manipulate(uri, {
    maxWidth: MAX_IMAGE_EDGE,
    maxHeight: MAX_IMAGE_EDGE,
  });
  let result;
  try {
    const image = await context.renderAsync();
    result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    image.release();
  } finally {
    // Frees the decoded photo from memory right away.
    context.release();
  }
  const saved = await keepFile(result.uri, `${id}.jpg`);
  return {
    id,
    kind: 'image',
    name,
    path: saved.path,
    mimeType: 'image/jpeg',
    size: saved.size,
    width: result.width,
    height: result.height,
  };
}

/** Puts placeholders in the composer right away, then prepares each file one by one. */
async function addInBackground(
  items: { draft: DraftAttachment; prepare: () => Promise<Attachment> }[],
) {
  const composer = useComposerStore.getState();
  composer.addAttachments(items.map((item) => item.draft));
  haptics.selection();

  for (const { draft, prepare } of items) {
    try {
      const attachment = await prepare();
      const stillThere = useComposerStore
        .getState()
        .attachments.some((entry) => entry.id === draft.id);
      if (stillThere) {
        useComposerStore.getState().updateAttachment(draft.id, { status: 'ready', attachment });
      } else {
        // Removed while it was being prepared: drop the saved copy.
        deleteFile(attachment.path);
      }
    } catch (error) {
      console.warn('Could not prepare a file.', error);
      useComposerStore
        .getState()
        .updateAttachment(draft.id, { status: 'failed', error: 'This file could not be added.' });
    }
  }
}

function photoItems(assets: ImagePicker.ImagePickerAsset[]) {
  return assets.map((asset, index) => {
    const id = newId();
    const name = asset.fileName ?? `Photo ${index + 1}.jpg`;
    return {
      draft: {
        id,
        kind: 'image' as AttachmentKind,
        name,
        status: 'preparing' as const,
        previewUri: asset.uri,
      },
      prepare: () => preparePhoto(asset.uri, id, name),
    };
  });
}

/** Opens the photo library. Returns how many photos were added. */
export async function addPhotosFromLibrary() {
  const left = slotsLeft();
  if (left <= 0) return 0;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: left > 1,
    selectionLimit: left,
    quality: 1,
  });
  if (result.canceled || result.assets.length === 0) return 0;
  const assets = result.assets.slice(0, left);
  void addInBackground(photoItems(assets));
  return assets.length;
}

/** Opens the camera. Returns how many photos were added (0 or 1). */
export async function addPhotoFromCamera() {
  if (slotsLeft() <= 0) return 0;
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Camera is off', 'Allow camera access in Settings to take a photo.');
    return 0;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || result.assets.length === 0) return 0;
  void addInBackground(photoItems(result.assets.slice(0, 1)));
  return 1;
}

function documentKind(asset: DocumentPicker.DocumentPickerAsset): AttachmentKind | undefined {
  const type = asset.mimeType?.toLowerCase() ?? '';
  const extension = extensionOf(asset.name);
  if (type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (TEXT_TYPES.includes(type) || TEXT_EXTENSIONS.includes(extension)) return 'text';
  return undefined;
}

/** Opens the file picker (PDF and text files). Returns how many files were added. */
export async function addDocuments() {
  const left = slotsLeft();
  if (left <= 0) return 0;
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', ...TEXT_TYPES],
    multiple: left > 1,
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return 0;

  const problems: string[] = [];
  const items = [];
  for (const asset of result.assets.slice(0, left)) {
    const kind = documentKind(asset);
    const size = asset.size ?? 0;
    if (!kind) {
      problems.push(`${asset.name}: only PDF and text files are supported.`);
      continue;
    }
    if (kind === 'pdf' && size > MAX_PDF_BYTES) {
      problems.push(`${asset.name}: PDFs can be up to 15 MB.`);
      continue;
    }
    if (kind === 'text' && size > MAX_TEXT_BYTES) {
      problems.push(`${asset.name}: text files can be up to 512 KB.`);
      continue;
    }
    const id = newId();
    const extension = extensionOf(asset.name) || (kind === 'pdf' ? 'pdf' : 'txt');
    const mimeType = kind === 'pdf' ? 'application/pdf' : (asset.mimeType ?? 'text/plain');
    items.push({
      draft: { id, kind, name: asset.name, status: 'preparing' as const },
      prepare: async (): Promise<Attachment> => {
        const saved = await keepFile(asset.uri, `${id}.${extension}`);
        return { id, kind, name: asset.name, path: saved.path, mimeType, size: saved.size || size };
      },
    });
  }

  if (problems.length > 0) Alert.alert('Some files were not added', problems.join('\n'));
  if (items.length === 0) return 0;
  void addInBackground(items);
  return items.length;
}
