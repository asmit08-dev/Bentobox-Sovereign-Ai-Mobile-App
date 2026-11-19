// WEB PREVIEW ONLY. Browsers have no app document folder, so a file is kept as a
// data URL, and the "path" is that data URL. Phones use files.ts.

async function toDataUrl(sourceUri: string) {
  if (sourceUri.startsWith('data:')) return sourceUri;
  const blob = await (await fetch(sourceUri)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

function base64Of(dataUrl: string) {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export async function keepFile(sourceUri: string, _fileName: string) {
  const path = await toDataUrl(sourceUri);
  return { path, size: Math.round((base64Of(path).length * 3) / 4) };
}

export function fileUri(path: string) {
  return path;
}

export function fileExists(path: string) {
  return path.startsWith('data:');
}

export async function readBase64(path: string) {
  return base64Of(path);
}

export async function readText(path: string) {
  const bytes = Uint8Array.from(atob(base64Of(path)), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function readUriBase64(uri: string) {
  return base64Of(await toDataUrl(uri));
}

export function deleteFile(_path: string) {}

export function deleteUri(_uri: string) {}

export function writeTempFile(_fileName: string, content: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
}
