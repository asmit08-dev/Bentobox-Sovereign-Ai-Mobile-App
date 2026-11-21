// WEB PREVIEW ONLY: question bodies are kept in memory (a page reload forgets them).
// Phones keep them as files (pendingBodies.ts), so they survive a restart.
const bodies = new Map<string, string>();

export async function savePendingBody(key: string, json: string) {
  bodies.set(key, json);
}

export async function loadPendingBody(key: string) {
  return bodies.get(key) ?? null;
}

export function deleteAllPendingBodies() {
  bodies.clear();
}

export async function deletePendingBody(key: string) {
  bodies.delete(key);
}
