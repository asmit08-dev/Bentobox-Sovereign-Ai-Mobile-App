import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ChatSummary, ServerMessage } from '../../src/api/types';
import {
  chatFromSummary,
  hasPendingAnswer,
  mergeAnswered,
  messagesFromServer,
  settleWaiting,
} from '../../src/chat/mapping';
import type {
  AssistantMessage,
  Attachment,
  Chat,
  Message,
  UserMessage,
} from '../../src/chat/types';

const ASKED_AT = '2026-11-21T07:54:45.243715+00:00';
const ANSWERED_AT = '2026-11-21T07:54:54.192628+00:00';

const server = (fields: Partial<ServerMessage>): ServerMessage => ({
  id: 'm',
  sequence_no: 1,
  role: 'user',
  content_kind: 'text',
  created_at: ASKED_AT,
  text: 'Hi',
  unavailable: null,
  request_id: 'r1',
  request_status: 'succeeded',
  error_code: null,
  quality_score: null,
  attachment_count: 0,
  ...fields,
});

const question = (fields: Partial<UserMessage>): UserMessage => ({
  id: 'q',
  role: 'user',
  text: 'Hi',
  attachments: [],
  createdAt: 1,
  status: 'sent',
  ...fields,
});

const answer = (fields: Partial<AssistantMessage>): AssistantMessage => ({
  id: 'a',
  role: 'assistant',
  text: '',
  status: 'done',
  createdAt: 2,
  ...fields,
});

const photo: Attachment = {
  id: 'p1',
  kind: 'image',
  name: 'Photo.jpg',
  path: 'attachments/p1.jpg',
  mimeType: 'image/jpeg',
  size: 1000,
};

const conversation = [
  server({ id: 'u1', role: 'user', text: 'Hi', request_id: 'r1' }),
  server({
    id: 'a1',
    sequence_no: 2,
    role: 'assistant',
    text: 'Hello',
    request_id: 'r1',
    created_at: ANSWERED_AT,
  }),
];

describe('messagesFromServer', () => {
  test('maps server messages', () => {
    const [user, assistant] = messagesFromServer(conversation, []) as [
      UserMessage,
      AssistantMessage,
    ];
    assert.equal(user.id, 'u1');
    assert.equal(user.role, 'user');
    assert.equal(user.text, 'Hi');
    assert.equal(user.requestId, 'r1');
    assert.equal(user.status, 'sent');
    assert.equal(user.createdAt, Date.parse(ASKED_AT));
    assert.equal(assistant.role, 'assistant');
    assert.equal(assistant.status, 'done');
    assert.equal(assistant.text, 'Hello');
  });

  test('keeps photos sent from this phone', () => {
    const local = [question({ id: 'local-u', attachments: [photo], requestId: 'r1' })];
    const items = [server({ id: 'u1', request_id: 'r1', attachment_count: 1 })];
    const [user] = messagesFromServer(items, local) as [UserMessage];
    assert.deepEqual(user.attachments, [photo]);
  });

  test('shows a count for photos sent from elsewhere', () => {
    const [user] = messagesFromServer([server({ attachment_count: 2 })], []) as [UserMessage];
    assert.deepEqual(user.attachments, []);
    assert.equal(user.attachmentCount, 2);
  });

  test('keeps unsent messages', () => {
    const unsent = question({ id: 'f1', text: 'Offline question', status: 'failed' });
    const result = messagesFromServer(conversation, [unsent]);
    assert.equal(result[result.length - 1].id, 'f1');
  });

  test('marks a failed answer', () => {
    const items = [
      server({ id: 'u1' }),
      server({
        id: 'a1',
        role: 'assistant',
        sequence_no: 2,
        text: null,
        request_status: 'failed',
        error_code: 'provider_error',
      }),
    ];
    const result = messagesFromServer(items, []);
    assert.equal((result[1] as AssistantMessage).status, 'error');
  });

  test('adds a waiting answer while the server is still answering', () => {
    const items = [server({ id: 'u1', request_status: 'processing' })];
    const result = messagesFromServer(items, []);
    const last = result[result.length - 1] as Message;
    assert.equal(last.role, 'assistant');
    assert.equal((last as AssistantMessage).status, 'waiting');
    assert.equal(hasPendingAnswer(items), true);
    assert.equal(hasPendingAnswer(conversation), false);
  });
});

describe('chatFromSummary', () => {
  const summary: ChatSummary = {
    id: 's1',
    title: 'New title',
    status: 'active',
    created_at: '2026-11-21T07:54:45Z',
    last_activity_at: '2026-11-21T07:55:06Z',
    can_continue: false,
    last_message_preview: 'Preview',
  };

  test('keeps the local id and messages', () => {
    const existing: Chat = {
      id: 'local-1',
      serverId: 's1',
      title: 'Old',
      createdAt: 1,
      updatedAt: 1,
      messages: [question({})],
      canContinue: true,
    };
    const chat = chatFromSummary(summary, existing);
    assert.equal(chat.id, 'local-1');
    assert.equal(chat.serverId, 's1');
    assert.equal(chat.title, 'New title');
    assert.equal(chat.updatedAt, Date.parse('2026-11-21T07:55:06Z'));
    assert.equal(chat.canContinue, false);
    assert.equal(chat.preview, 'Preview');
    assert.equal(chat.messages, existing.messages);
  });

  test('makes a new chat from the server', () => {
    const chat = chatFromSummary(summary);
    assert.equal(chat.id, 's1');
    assert.equal(chat.serverId, 's1');
    assert.deepEqual(chat.messages, []);
  });
});

describe('settleWaiting', () => {
  const chatWith = (messages: Message[]): Record<string, Chat> => ({
    c1: { id: 'c1', title: 'T', createdAt: 1, updatedAt: 1, messages, canContinue: true },
  });

  test('turns a waiting question into Not sent', () => {
    const settled = settleWaiting(
      chatWith([question({ idempotencyKey: 'k1' }), answer({ status: 'waiting' })]),
    );
    assert.equal(settled.c1.messages.length, 1);
    assert.equal((settled.c1.messages[0] as UserMessage).status, 'failed');
  });

  test('keeps a question the server already has', () => {
    const settled = settleWaiting(
      chatWith([question({ requestId: 'r1' }), answer({ status: 'waiting' })]),
    );
    assert.equal(settled.c1.messages.length, 1);
    assert.equal((settled.c1.messages[0] as UserMessage).status, 'sent');
  });
});

describe('photos of questions no longer loaded', () => {
  test("come back from the chat's saved list, by request id", () => {
    const result = messagesFromServer(conversation, [], { r1: [photo] });
    assert.deepEqual((result[0] as UserMessage).attachments, [photo]);
  });
});

describe('mergeAnswered', () => {
  test('a re-sent question the server already showed is shown once, with its photos', () => {
    const messages: Message[] = [
      question({ id: 's1', text: 'Hi', requestId: 'r1' }),
      answer({ id: 's2', text: 'Hello', requestId: 'r1' }),
      question({ id: 'u1', text: 'Hi', requestId: 'r1', attachments: [photo] }),
      answer({ id: 'a1', text: 'Hello', requestId: 'r1' }),
    ];
    assert.deepEqual(
      mergeAnswered(messages, 'u1', 'a1', 'r1').map((message) => message.id),
      ['u1', 'a1'],
    );
  });

  test('changes nothing when the server had not shown it', () => {
    const messages: Message[] = [
      question({ id: 's1', requestId: 'r0' }),
      answer({ id: 's2', requestId: 'r0' }),
      question({ id: 'u1', requestId: 'r1' }),
      answer({ id: 'a1', requestId: 'r1' }),
    ];
    assert.equal(mergeAnswered(messages, 'u1', 'a1', 'r1'), messages);
  });
});
