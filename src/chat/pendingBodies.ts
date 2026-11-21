// The exact body of each question, kept until its answer arrives. If the answer is cut off on the
// way back, the same bytes go out again with the same Idempotency-Key, so the server returns the
// answer it already made instead of making (and charging) a new one.
// The web preview uses pendingBodies.web.ts (memory only).
import { Directory, File, Paths } from 'expo-file-system';

function pendingFolder() {
  const folder = new Directory(Paths.cache, 'pending');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}

function fileFor(key: string) {
  return new File(pendingFolder(), `${key.replace(/[^\w-]/g, '_')}.json`);
}

export async function savePendingBody(key: string, json: string) {
  const file = fileFor(key);
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
}

export async function loadPendingBody(key: string) {
  try {
    const file = fileFor(key);
    return file.exists ? await file.text() : null;
  } catch {
    return null;
  }
}

/** Deletes every saved body (Sign out, another account). */
export function deleteAllPendingBodies() {
  try {
    const folder = new Directory(Paths.cache, 'pending');
    if (folder.exists) folder.delete();
  } catch {
    // Already gone.
  }
}

export async function deletePendingBody(key: string) {
  try {
    const file = fileFor(key);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}
