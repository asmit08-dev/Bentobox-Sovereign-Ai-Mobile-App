import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ChatSummary } from '../../src/api/types';
import { applyChatPage, linkServer, type ChatList } from '../../src/chat/chatList';
import type { Chat, UserMessage } from '../../src/chat/types';

const chat = (id: string, fields: Partial<Chat> = {}): Chat => ({
  id,
  title: id,
  createdAt: 1,
  updatedAt: 1,
  messages: [],
  canContinue: true,
  ...fields,
});

const asked: UserMessage = {
  id: 'q1',
  role: 'user',
  text: 'What is on this page?',
  attachments: [],
  createdAt: 1,
  status: 'sent',
};

const summary = (id: string): ChatSummary => ({
  id,
  title: id,
  status: 'active',
  created_at: '2026-11-21T07:54:45Z',
  last_activity_at: '2026-11-21T07:55:06Z',
  can_continue: true,
});

const list = (fields: Partial<ChatList>): ChatList => ({
  chats: {},
  order: [],
  activeChatId: null,
  nextCursor: null,
  ...fields,
});

describe('linkServer', () => {
  test('a phone-only chat linked to a chat the list already shows stays one chat, in that place', () => {
    const state = list({
      chats: {
        A: chat('A', { serverId: 'A' }),
        X: chat('X', { serverId: 'X' }),
        L: chat('L', { messages: [asked] }),
      },
      order: ['A', 'X'],
      activeChatId: 'L',
    });
    const next = linkServer(state, 'L', 'X');
    assert.deepEqual(Object.keys(next.chats).sort(), ['A', 'L']);
    assert.equal(next.chats.L.serverId, 'X');
    assert.deepEqual(next.chats.L.messages, [asked]);
    assert.deepEqual(next.order, ['A', 'L']);
    assert.equal(next.activeChatId, 'L');
  });

  test('a chat the list does not show yet goes on top', () => {
    const state = list({ chats: { A: chat('A', { serverId: 'A' }), L: chat('L') }, order: ['A'] });
    const next = linkServer(state, 'L', 'X');
    assert.deepEqual(next.order, ['L', 'A']);
    assert.equal(next.chats.L.serverId, 'X');
  });

  test('if the listed copy was open, the linked chat is open instead', () => {
    const state = list({
      chats: { X: chat('X', { serverId: 'X' }), L: chat('L') },
      order: ['X'],
      activeChatId: 'X',
    });
    assert.equal(linkServer(state, 'L', 'X').activeChatId, 'L');
  });
});

describe('applyChatPage', () => {
  test('the first page sets the order and the cursor', () => {
    const next = applyChatPage(list({}), [summary('A'), summary('B')], 'next', true);
    assert.deepEqual(next.order, ['A', 'B']);
    assert.equal(next.nextCursor, 'next');
    assert.equal(next.chats.B.serverId, 'B');
  });

  test('a later page adds to the order', () => {
    const first = applyChatPage(list({}), [summary('A')], 'next', true);
    const next = applyChatPage({ ...list({}), ...first }, [summary('B')], null, false);
    assert.deepEqual(next.order, ['A', 'B']);
    assert.equal(next.nextCursor, null);
  });

  test('when two chats share a server id, the one with messages is kept', () => {
    const state = list({
      chats: {
        X: chat('X', { serverId: 'X' }),
        L: chat('L', { serverId: 'X', messages: [asked] }),
      },
      order: ['X'],
    });
    const next = applyChatPage(state, [summary('X')], null, true);
    assert.deepEqual(next.order, ['L']);
    assert.deepEqual(Object.keys(next.chats), ['L']);
    assert.deepEqual(next.chats.L.messages, [asked]);
  });
});
