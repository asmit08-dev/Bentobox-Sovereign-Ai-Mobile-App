// Building the body of POST /ask, and the size rules for pictures.
// No React Native imports: Node tests this file.
import type { AskAudio, AskBody, AskImage } from '../api/types';

/** The server takes at most 6 MB. Keep the JSON under 5.5 million characters to be safe. */
export const REQUEST_BUDGET_CHARS = 5_500_000;
/** The server refuses longer questions (it accepts 32 000, refuses 40 000). */
export const MAX_QUESTION_CHARS = 32_000;
/** Pictures are never shrunk below this long edge: page text stays readable. */
export const MIN_IMAGE_EDGE = 1000;
/** Each shrink step makes the long edge this much smaller… */
export const SHRINK_FACTOR = 0.8;
/** …and saves the JPEG at this quality. */
export const SHRINK_QUALITY = 0.6;

// The JSON around each picture: {"media_type":"image/jpeg","base64":""},
const PER_IMAGE_OVERHEAD = 64;
// Pictures re-encoded at the same time. Each one is decoded in full, so a phone with many
// pages would run out of memory doing them all at once.
const SHRINK_AT_ONCE = 3;

/** `work` on every item, `limit` at a time, results in the same order. */
async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type AskInput = {
  question?: string;
  /** The server's id for the chat. Leave out to start a new chat. */
  chatId?: string;
  /** Photos and document pages, in order. The first goes in `image`, the rest in `more_images`. */
  images?: AskImage[];
  audio?: AskAudio;
  /** With audio: also ask for a spoken answer. */
  replyAsVoice?: boolean;
};

/** The app's question → the body the server expects. Empty parts are left out. */
export function buildAskBody(input: AskInput): AskBody {
  const body: AskBody = {};
  const question = input.question?.trim() ?? '';
  if (question) body.question = question.slice(0, MAX_QUESTION_CHARS);
  if (input.chatId) body.chat_id = input.chatId;
  const images = input.images ?? [];
  if (images.length > 0) body.image = images[0];
  if (images.length > 1) body.more_images = images.slice(1);
  if (input.audio) {
    body.audio = input.audio;
    if (input.replyAsVoice) body.reply_as = 'voice';
  }
  return body;
}

/**
 * How many pictures, from the first, fit in one request. `imageChars` are the base64 lengths;
 * `otherChars` is everything else in the body (the question and so on).
 * Example: ([2 000 000, 2 000 000, 2 000 000], 1000) → 2.
 */
export function imagesThatFit(
  imageChars: number[],
  otherChars: number,
  budget = REQUEST_BUDGET_CHARS,
) {
  let total = otherChars;
  let count = 0;
  for (const chars of imageChars) {
    total += chars + PER_IMAGE_OVERHEAD;
    if (total > budget) break;
    count += 1;
  }
  return count;
}

/** The next smaller long edge for a picture, or null when it would go below 1000 px. */
export function nextEdge(edge: number) {
  const next = Math.round(edge * SHRINK_FACTOR);
  return next >= MIN_IMAGE_EDGE ? next : null;
}

type FitOptions<P> = {
  /** The longest side of the pictures now, in px. */
  edge: number;
  /** Characters of the rest of the body (the question). */
  otherChars: number;
  /** The account's `image_bytes_max`. */
  maxImageBytes: number;
  budget?: number;
  /** Re-encodes one picture with its longest side at `edge` (ImageManipulator on phones). */
  shrink: (picture: P, edge: number) => Promise<P>;
};

/**
 * Makes the pictures of one question fit in one request. While they are over the budget, or
 * one is over the account's per-picture limit, every picture is re-encoded a step smaller
 * (never under 1000 px). Pictures that still don't fit are then left out, from the end.
 */
export async function fitPictures<P extends { base64: string }>(
  pictures: P[],
  options: FitOptions<P>,
): Promise<{ pictures: P[]; dropped: number }> {
  const budget = options.budget ?? REQUEST_BUDGET_CHARS;
  const maxChars = Math.floor((options.maxImageBytes * 4) / 3);
  const tooBig = (list: P[]) =>
    list.reduce((total, p) => total + p.base64.length + PER_IMAGE_OVERHEAD, options.otherChars) >
      budget || list.some((p) => p.base64.length > maxChars);

  let current = pictures;
  let edge = options.edge;
  while (current.length > 0 && tooBig(current)) {
    const next = nextEdge(edge);
    if (next === null) break;
    current = await mapLimited(current, SHRINK_AT_ONCE, (p) => options.shrink(p, next));
    edge = next;
  }
  const fit = imagesThatFit(
    current.map((p) => p.base64.length),
    options.otherChars,
    budget,
  );
  return { pictures: current.slice(0, fit), dropped: current.length - fit };
}
