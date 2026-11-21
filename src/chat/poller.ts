// Looking again, every few seconds, at a chat whose answer the server is still writing.
// No React Native imports: Node tests this file.

type PollerOptions = {
  everyMs: number;
  /** Stop after this long and give up on the waiting dots. */
  forMs: number;
  /** Only the chat on screen is watched. */
  isOpen: (chatId: string) => boolean;
  /** Looks once. Resolves true while the answer is still coming. A failed look tries again. */
  look: (chatId: string) => Promise<boolean>;
  /** The time is up and the answer still isn't there. */
  giveUp: (chatId: string) => void;
  now?: () => number;
};

export function createPoller(options: PollerOptions) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const startedAt = new Map<string, number>();
  const now = options.now ?? (() => Date.now());

  function stop(chatId: string) {
    clearTimeout(timers.get(chatId));
    timers.delete(chatId);
    startedAt.delete(chatId);
  }

  /** Looks again in a moment. Calling it again only moves the chat's one timer. */
  function schedule(chatId: string) {
    if (!startedAt.has(chatId)) startedAt.set(chatId, now());
    clearTimeout(timers.get(chatId));
    timers.set(
      chatId,
      setTimeout(() => void run(chatId), options.everyMs),
    );
  }

  async function run(chatId: string) {
    timers.delete(chatId);
    if (!options.isOpen(chatId)) {
      stop(chatId);
      return;
    }
    if (now() - (startedAt.get(chatId) ?? now()) >= options.forMs) {
      stop(chatId);
      options.giveUp(chatId);
      return;
    }
    let waiting = true;
    try {
      waiting = await options.look(chatId);
    } catch {
      waiting = true; // A failed look (offline for a moment) tries again next time.
    }
    if (waiting) schedule(chatId);
    else stop(chatId);
  }

  return { schedule, stop };
}
