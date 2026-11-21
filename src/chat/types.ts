// What the app keeps about chats. The server has the real history; the phone keeps a copy so
// chats open fast and show offline. These shapes are saved on the phone (stores/chats.ts,
// version 2), so change them with care. No React Native imports: Node tests the code using them.

export type AttachmentKind = 'image' | 'pdf';

/** One page of a PDF, drawn as a JPEG and saved next to the PDF. */
export type PageImage = { path: string; width: number; height: number; size: number };

/** A file the user attached. The file itself is saved in the app's document folder. */
export type Attachment = {
  id: string;
  kind: AttachmentKind;
  /** The name shown to the user, for example "Report.pdf". */
  name: string;
  /** Where the file is saved, relative to the app's document folder ("attachments/x.jpg"). */
  path: string;
  mimeType: string;
  /** Size in bytes. */
  size: number;
  width?: number;
  height?: number;
  /** PDFs: the pages that will be sent, as pictures. */
  pages?: PageImage[];
  /** PDFs: how many pages the file has (it can be more than `pages`). */
  pageCount?: number;
};

export type UserMessage = {
  id: string;
  role: 'user';
  text: string;
  /** Files sent from this phone. The server never sends files back. */
  attachments: Attachment[];
  createdAt: number;
  /** "failed" when the question never got an answer back ("Not sent · Tap to retry"). */
  status: 'sent' | 'failed';
  /** Asked by voice: the text is the server's transcript once it arrives. */
  voice?: boolean;
  /** The server's id for this question, once it has it. */
  requestId?: string;
  /** Sent again with the same key, a question is never answered or charged twice. */
  idempotencyKey?: string;
  /** How many files the server says this question had (for questions sent from elsewhere). */
  attachmentCount?: number;
};

/**
 * waiting: the answer has not arrived yet.
 * done: it arrived.
 * error: it could not be answered; `note` says why.
 */
export type AnswerStatus = 'waiting' | 'done' | 'error';

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  text: string;
  status: AnswerStatus;
  /** A short line under the answer: why it failed, or that it may be incomplete. */
  note?: string;
  createdAt: number;
  requestId?: string;
};

export type Message = UserMessage | AssistantMessage;

export type Chat = {
  /** A stable key on this phone. For chats that came from the server it equals `serverId`. */
  id: string;
  /** The server's id, once the server knows this chat. */
  serverId?: string;
  title: string;
  createdAt: number;
  /** The latest activity (the server's `last_activity_at`). */
  updatedAt: number;
  messages: Message[];
  /** False when the server says this chat can't take more questions. */
  canContinue: boolean;
  /** Photos sent from this phone, by request id: kept when their question is no longer loaded. */
  attachmentsByRequest?: Record<string, Attachment[]>;
  /** The last message, as the chat list shows it. */
  preview?: string;
  /** Pass to the server as `before` to load older messages. null when there are none. */
  olderBefore?: number | null;
  /** True once its messages have been loaded from the server. */
  synced?: boolean;
};
