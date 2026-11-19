// Saves app state as JSON files in the app's document folder (phones).
// The web preview uses storage.web.ts instead.
import { File, Paths } from 'expo-file-system';
import type { StateStorage } from 'zustand/middleware';

function fileFor(name: string) {
  return new File(Paths.document, `${name}.json`);
}

/**
 * A zustand storage backed by files. Writes are queued, so two saves never overlap,
 * and only the newest value of each store is written.
 */
export function createFileStorage(): StateStorage {
  const waiting = new Map<string, string | null>();
  let running = false;

  async function writeAll() {
    running = true;
    while (waiting.size > 0) {
      const [name, value] = waiting.entries().next().value as [string, string | null];
      waiting.delete(name);
      try {
        const file = fileFor(name);
        if (value === null) {
          if (file.exists) file.delete();
        } else {
          if (!file.exists) file.create({ intermediates: true });
          await file.write(value);
        }
      } catch (error) {
        console.warn(`Could not save "${name}".`, error);
      }
    }
    running = false;
  }

  function queue(name: string, value: string | null) {
    waiting.set(name, value);
    if (!running) void writeAll();
  }

  return {
    getItem: async (name) => {
      const file = fileFor(name);
      return file.exists ? file.text() : null;
    },
    setItem: (name, value) => queue(name, value),
    removeItem: (name) => queue(name, null),
  };
}
