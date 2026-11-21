// Adding photos, pictures and PDFs to the composer.
// Photos are always shrunk and turned into JPEG (iPhones take HEIC, which the AI can't read).
// A PDF is drawn page by page into JPEGs when it is added: the server reads pictures, not PDFs.
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { Attachment, AttachmentKind, PageImage } from '@/chat/types';
import { showProblem } from '@/lib/dialog';
import { keepFile, readBase64, writeBase64File } from '@/lib/files';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { PDF_CANT_OPEN, renderPdfPages } from '@/lib/pdf/renderPdf';
import { useAuthStore } from '@/stores/auth';
import {
  MAX_ATTACHMENTS,
  deleteAttachmentFiles,
  useComposerStore,
  type DraftAttachment,
} from '@/stores/composer';

// The longest side of a photo we send. Bigger photos cost more and are not read better.
const MAX_IMAGE_EDGE = 1568;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
// PDF pages: long side and JPEG quality. Small print stays readable.
const PAGE_EDGE = 1400;
const PAGE_QUALITY = 0.7;
const DEFAULT_PAGES_MAX = 50;
const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const PICTURE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

function slotsLeft() {
  const left = MAX_ATTACHMENTS - useComposerStore.getState().attachments.length;
  if (left <= 0) {
    showProblem('Too many files', `You can add up to ${MAX_ATTACHMENTS} files to one message.`);
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

/** Saves a PDF and draws its first pages (as many as one question may carry) as JPEGs. */
async function preparePdf(uri: string, id: string, name: string, size: number) {
  const saved = await keepFile(uri, `${id}.pdf`);
  const maxPages = useAuthStore.getState().features?.document_pages_max ?? DEFAULT_PAGES_MAX;
  let rendered;
  try {
    rendered = await renderPdfPages(await readBase64(saved.path), {
      maxPages,
      maxEdge: PAGE_EDGE,
      quality: PAGE_QUALITY,
    });
  } catch {
    deleteAttachmentFiles({ path: saved.path });
    throw new Error(PDF_CANT_OPEN);
  }
  if (rendered.pages.length === 0) {
    deleteAttachmentFiles({ path: saved.path });
    throw new Error(PDF_CANT_OPEN);
  }
  const pages: PageImage[] = [];
  for (const [index, page] of rendered.pages.entries()) {
    const file = await writeBase64File(`${id}-page${index + 1}.jpg`, page.base64, 'attachments');
    pages.push({ path: file.path, width: page.width, height: page.height, size: file.size });
  }
  const attachment: Attachment = {
    id,
    kind: 'pdf',
    name,
    path: saved.path,
    mimeType: 'application/pdf',
    size: saved.size || size,
    pages,
    pageCount: rendered.totalPages,
  };
  return attachment;
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
        deleteAttachmentFiles(attachment);
      }
    } catch (error) {
      console.warn('Could not prepare a file.', error);
      const message =
        error instanceof Error && error.message === PDF_CANT_OPEN
          ? PDF_CANT_OPEN
          : 'This file could not be added.';
      useComposerStore.getState().updateAttachment(draft.id, { status: 'failed', error: message });
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
    showProblem('Camera is off', 'Allow camera access in Settings to take a photo.');
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
  if (PICTURE_TYPES.includes(type) || PICTURE_EXTENSIONS.includes(extension)) return 'image';
  return undefined;
}

/** Opens the file picker (PDFs and pictures). Returns how many files were added. */
export async function addDocuments() {
  const left = slotsLeft();
  if (left <= 0) return 0;
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', ...PICTURE_TYPES],
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
      problems.push(`${asset.name}: only PDFs and pictures can be added.`);
      continue;
    }
    if (kind === 'pdf' && size > MAX_PDF_BYTES) {
      problems.push(`${asset.name}: PDFs can be up to 15 MB.`);
      continue;
    }
    const id = newId();
    const { name, uri } = asset;
    items.push(
      kind === 'image'
        ? {
            draft: { id, kind, name, status: 'preparing' as const, previewUri: uri },
            prepare: () => preparePhoto(uri, id, name),
          }
        : {
            draft: { id, kind, name, status: 'preparing' as const },
            prepare: () => preparePdf(uri, id, name, size),
          },
    );
  }

  if (problems.length > 0) showProblem('Some files were not added', problems.join('\n'));
  if (items.length === 0) return 0;
  void addInBackground(items);
  return items.length;
}
