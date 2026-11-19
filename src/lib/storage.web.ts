// WEB PREVIEW ONLY: keeps app state in the browser's localStorage. Phones use storage.ts.
import type { StateStorage } from 'zustand/middleware';

export function createFileStorage(): StateStorage {
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
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
