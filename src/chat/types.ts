// What the app stores about chats. These shapes are saved on the phone,
// so change them with care (old saved chats must still load).
import type { CreatedImage } from '@/api/contract';

export type AttachmentKind = 'image' | 'pdf' | 'text';

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
};

export type UserMessage = {
  id: string;
  role: 'user';
  text: string;
  attachments: Attachment[];
  createdAt: number;
  /** "failed" when the message never reached the server. */
  status: 'sent' | 'failed';
};

/**
 * streaming: the answer is still arriving.
 * done: finished normally.
 * stopped: the user pressed Stop (the partial answer is kept).
 * error: it broke; `note` says why.
 */
export type AnswerStatus = 'streaming' | 'done' | 'stopped' | 'error';

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  text: string;
  images: CreatedImage[];
  status: AnswerStatus;
  /** A short line under the answer: why it stopped, or that it was cut short. */
  note?: string;
  feedback?: 'up' | 'down';
  createdAt: number;
};

export type Message = UserMessage | AssistantMessage;

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};
