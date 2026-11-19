// Attachment files on the phone. They live in the app's document folder, so they
// stay as long as the chat does. The web preview uses files.web.ts instead.
import { Directory, File, Paths } from 'expo-file-system';

const FOLDER = 'attachments';

function attachmentsFolder() {
  const folder = new Directory(Paths.document, FOLDER);
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}

/** "attachments/x.jpg" → the file inside the document folder (each folder name is its own part). */
function fileAt(path: string) {
  return new File(Paths.document, ...path.split('/').filter(Boolean));
}

/**
 * Copies a picked file (camera, photo library, document picker) into the attachments
 * folder. Returns the path to store, relative to the document folder.
 */
export async function keepFile(sourceUri: string, fileName: string) {
  const target = new File(attachmentsFolder(), fileName);
  if (target.exists) target.delete();
  await new File(sourceUri).copy(target);
  return { path: `${FOLDER}/${fileName}`, size: target.size };
}

/** A URI that <Image> and the share sheet can open. */
export function fileUri(path: string) {
  return fileAt(path).uri;
}

export function fileExists(path: string) {
  return fileAt(path).exists;
}

export function readBase64(path: string) {
  return fileAt(path).base64();
}

export function readText(path: string) {
  return fileAt(path).text();
}

/** Base64 of any file URI (for example a fresh voice recording). */
export function readUriBase64(uri: string) {
  return new File(uri).base64();
}

export function deleteFile(path: string) {
  try {
    const file = fileAt(path);
    if (file.exists) file.delete();
  } catch {
    // Already gone. Nothing to do.
  }
}

export function deleteUri(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone. Nothing to do.
  }
}

/** Writes text to a temporary file (for sharing a drawing) and returns its URI. */
export function writeTempFile(fileName: string, content: string) {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.writeSync(content);
  return file.uri;
}
