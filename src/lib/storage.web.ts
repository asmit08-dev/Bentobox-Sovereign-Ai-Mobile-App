// WEB PREVIEW ONLY: keeps app state in the browser's localStorage. Phones use storage.ts.
import type { StateStorage } from 'zustand/middleware';

// Stores saved under the app's old name are read from there until they are saved again.
const FORMER_NAMES: Record<string, string> = { 'sovrns-chats': 'bentobox-chats' };

export function createFileStorage(): StateStorage {
  return {
    getItem: (name) => {
      try {
        const former = FORMER_NAMES[name];
        return localStorage.getItem(name) ?? (former ? localStorage.getItem(former) : null);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch {
        // Storage is full or blocked. The preview keeps working without saving.
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        // Ignore.
      }
    },
  };
}
