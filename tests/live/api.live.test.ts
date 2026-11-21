// Talks to the real Sovrns API. It runs only when SOVRNS_TEST_KEY is set in the shell:
//   SOVRNS_TEST_KEY=sk-app-… npm run test:live
// The key is never saved in this repo. Uses about 6 of the key's daily questions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { ApiError, configureApi } from '../../src/api/http';
import * as api from '../../src/api/sovrns';
import { newId } from '../../src/lib/id';

const KEY = process.env.SOVRNS_TEST_KEY ?? '';
const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url)).toString('base64');
// The app's own Idempotency-Key format, so the server is tested with exactly what the app sends.
const newKey = () => newId();

describe('Sovrns API (live)', { skip: KEY ? false : 'set SOVRNS_TEST_KEY to run' }, () => {
  const created = new Set<string>();
  let followUpChat = '';

  before(() => {
    configureApi({ baseUrl: process.env.SOVRNS_BASE_URL ?? 'https://sovrns.com' });
  });

  after(async () => {
    for (const chatId of created) {
      await api.deleteChat(KEY, chatId).catch(() => {});
    }
  });

  test('me returns the limits', async () => {
    const me = await api.getMe(KEY);
    assert.equal(me.features.document_pages_max, 50);
    assert.equal(me.features.image_bytes_max, 4194304);
    assert.ok(me.assistant.questions_per_day > 0);
  });

  test('asks in a new chat, then a follow-up', async () => {
    const first = await api.ask(
      KEY,
      { question: 'What is photosynthesis? One short sentence.' },
      { idempotencyKey: newKey() },
    );
    created.add(first.chat_id);
    assert.equal(typeof first.chat_id, 'string');
    assert.equal(first.status, 'succeeded');

    const second = await api.ask(
      KEY,
      { question: 'Give one example in one sentence.', chat_id: first.chat_id },
      { idempotencyKey: newKey() },
    );
    assert.equal(second.chat_id, first.chat_id);
    assert.equal(second.context?.history_message_count, 2);
    followUpChat = first.chat_id;
  });

  test('a replayed key gives the same answer once', async () => {
    const before = await api.getMe(KEY);
    const idempotencyKey = newKey();
    const body = JSON.stringify({ question: 'Say only the word: blue' });
    const first = await api.ask(KEY, body, { idempotencyKey });
    created.add(first.chat_id);
    const replay = await api.ask(KEY, body, { idempotencyKey });
    assert.equal(replay.request_id, first.request_id);
    const afterMe = await api.getMe(KEY);
    assert.equal(afterMe.assistant.questions_used_today, before.assistant.questions_used_today + 1);
  });

  test('asks about a photo and two pages', async () => {
    const photo = await api.ask(
      KEY,
      {
        question: 'Solve this question. One line.',
        image: { media_type: 'image/jpeg', base64: fixture('question.jpg') },
      },
      { idempotencyKey: newKey() },
    );
    created.add(photo.chat_id);
    assert.match(photo.answer, /84/);

    const pages = await api.ask(
      KEY,
      {
        question: 'These are 2 pages of one document. In one line, what does each page say?',
        image: { media_type: 'image/jpeg', base64: fixture('question.jpg') },
        more_images: [{ media_type: 'image/jpeg', base64: fixture('page2.jpg') }],
      },
      { idempotencyKey: newKey() },
    );
    created.add(pages.chat_id);
    assert.equal(pages.status, 'succeeded');
  });

  test('asks by voice with a spoken reply', async () => {
    const voice = await api.ask(
      KEY,
      { audio: { media_type: 'audio/m4a', base64: fixture('question.m4a') }, reply_as: 'voice' },
      { idempotencyKey: newKey() },
    );
    created.add(voice.chat_id);
    assert.match(voice.transcript ?? '', /France/i);
    assert.equal(voice.voice_reply?.media_type, 'audio/ogg');
  });

  test('pages chats and messages', async () => {
    const chats = await api.listChats(KEY, { limit: 1 });
    assert.notEqual(chats.next_cursor, null);
    const messages = await api.listMessages(KEY, followUpChat, { limit: 1 });
    assert.notEqual(messages.next_before, null);
  });

  test('renames and deletes', async () => {
    const renamed = await api.renameChat(KEY, followUpChat, 'Live test');
    assert.equal(renamed.title, 'Live test');
    await api.deleteChat(KEY, followUpChat);
    created.delete(followUpChat);
    await assert.rejects(api.listMessages(KEY, followUpChat), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'chat_not_found');
      return true;
    });
  });

  test('rejects a wrong key', async () => {
    await assert.rejects(api.getMe('sk-app-wrong'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'invalid_credential');
      return true;
    });
  });
});
