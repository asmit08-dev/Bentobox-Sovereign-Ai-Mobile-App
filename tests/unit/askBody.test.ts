import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { AskImage } from '../../src/api/types';
import {
  MAX_QUESTION_CHARS,
  buildAskBody,
  fitPictures,
  imagesThatFit,
  nextEdge,
} from '../../src/chat/askBody';

const image = (n: number): AskImage => ({ media_type: 'image/jpeg', base64: `img${n}` });

describe('buildAskBody', () => {
  test('text only', () => {
    const body = buildAskBody({ question: 'Hi' });
    assert.deepEqual(body, { question: 'Hi' });
    assert.equal('chat_id' in body, false);
  });

  test('a follow-up carries the chat id', () => {
    assert.deepEqual(buildAskBody({ question: 'Hi', chatId: 'c1' }), {
      question: 'Hi',
      chat_id: 'c1',
    });
  });

  test('three images: the first in image, the rest in more_images', () => {
    const body = buildAskBody({ question: 'Pages', images: [image(1), image(2), image(3)] });
    assert.deepEqual(body.image, image(1));
    assert.deepEqual(body.more_images, [image(2), image(3)]);
  });

  test('one image has no more_images', () => {
    const body = buildAskBody({ question: 'Photo', images: [image(1)] });
    assert.equal('more_images' in body, false);
  });

  test('an empty question with an image sends no question', () => {
    const body = buildAskBody({ question: '   ', images: [image(1)] });
    assert.equal('question' in body, false);
  });

  test('voice asks for a spoken reply only when wanted', () => {
    const audio = { media_type: 'audio/m4a', base64: 'aaa' };
    assert.deepEqual(buildAskBody({ audio, replyAsVoice: true }), { audio, reply_as: 'voice' });
    assert.equal('reply_as' in buildAskBody({ audio, replyAsVoice: false }), false);
  });

  test('a very long question is cut to the limit', () => {
    const body = buildAskBody({ question: 'a'.repeat(40_000) });
    assert.equal(MAX_QUESTION_CHARS, 32_000);
    assert.equal(body.question?.length, 32_000);
  });
});

describe('imagesThatFit', () => {
  test('counts the leading pictures that fit in the budget', () => {
    assert.equal(imagesThatFit([2e6, 2e6, 2e6], 1000), 2);
  });

  test('is 0 when not even one fits', () => {
    assert.equal(imagesThatFit([6e6], 0), 0);
  });
});

describe('nextEdge', () => {
  test('shrinks by a fifth', () => {
    assert.equal(nextEdge(1568), 1254);
    assert.equal(nextEdge(1254), 1003);
  });

  test('never goes below 1000 px', () => {
    assert.equal(nextEdge(1003), null);
  });
});

describe('fitPictures', () => {
  type Pic = { base64: string; edge: number };
  const pic = (chars: number, edge = 1568): Pic => ({ base64: 'x'.repeat(chars), edge });
  // A fake re-encode: the picture shrinks with its edge (area), like a real JPEG roughly does.
  const shrinkCalls: number[] = [];
  const shrink = async (picture: Pic, edge: number): Promise<Pic> => {
    shrinkCalls.push(edge);
    const ratio = (edge / picture.edge) ** 2;
    return pic(Math.floor(picture.base64.length * ratio * 0.75), edge);
  };
  const options = { edge: 1568, otherChars: 100, maxImageBytes: 4_194_304, shrink };

  test('pictures under the budget are sent as they are', async () => {
    shrinkCalls.length = 0;
    const pictures = [pic(1000), pic(2000)];
    const result = await fitPictures(pictures, { ...options, budget: 10_000 });
    assert.deepEqual(result.pictures, pictures);
    assert.equal(result.dropped, 0);
    assert.deepEqual(shrinkCalls, []);
  });

  test('over the budget, every picture is re-encoded smaller until they fit', async () => {
    shrinkCalls.length = 0;
    const result = await fitPictures([pic(4000), pic(4000), pic(4000)], {
      ...options,
      budget: 10_000,
    });
    assert.equal(result.pictures.length, 3);
    assert.equal(result.dropped, 0);
    // One round: 1568 → 1254 for each of the 3 pictures (3 × 4000 → 3 × ~1918 chars).
    assert.deepEqual(shrinkCalls, [1254, 1254, 1254]);
    assert.ok(result.pictures.every((picture) => picture.edge === 1254));
  });

  test('shrinking stops at 1000 px, then the pictures that still do not fit are dropped', async () => {
    shrinkCalls.length = 0;
    const result = await fitPictures([pic(20_000), pic(20_000), pic(20_000), pic(20_000)], {
      ...options,
      budget: 10_000,
    });
    // 1568 → 1254 → 1003, and 802 would be below the floor. Each ends at ~4602 characters,
    // so 2 fit in 10 000 (with 100 for the question and 64 around each picture).
    assert.deepEqual([...new Set(shrinkCalls)], [1254, 1003]);
    assert.equal(result.pictures.length, 2);
    assert.equal(result.dropped, 2);
  });

  test('one picture over the per-picture limit is shrunk even when the total fits', async () => {
    shrinkCalls.length = 0;
    const result = await fitPictures([pic(7000)], {
      ...options,
      budget: 1_000_000,
      maxImageBytes: 3000, // 4000 base64 characters
    });
    assert.deepEqual(shrinkCalls, [1254]);
    assert.ok(result.pictures[0].base64.length <= 4000);
  });

  test('re-encodes at most 3 pictures at a time', async () => {
    let running = 0;
    let most = 0;
    const slowShrink = async (_picture: Pic, edge: number): Promise<Pic> => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return pic(10, edge);
    };
    const many = Array.from({ length: 10 }, () => pic(4000));
    const result = await fitPictures(many, { ...options, budget: 10_000, shrink: slowShrink });
    assert.equal(result.pictures.length, 10);
    assert.equal(most, 3);
  });

  test('no pictures: nothing to do', async () => {
    const result = await fitPictures([], options);
    assert.deepEqual(result, { pictures: [], dropped: 0 });
  });
});
