// Turns saved messages into the request the backend expects (src/api/contract.ts).
import type { ChatRequest, ChatTurn, TurnAttachment } from '@/api/contract';
import type { Attachment, Message } from '@/chat/types';
import { readBase64, readText } from '@/lib/files';

async function toTurnAttachment(attachment: Attachment): Promise<TurnAttachment | undefined> {
  try {
    switch (attachment.kind) {
      case 'image':
        return {
          kind: 'image',
          name: attachment.name,
          mimeType: 'image/jpeg',
          data: await readBase64(attachment.path),
        };
      case 'pdf':
        return { kind: 'pdf', name: attachment.name, data: await readBase64(attachment.path) };
      case 'text':
        return { kind: 'text', name: attachment.name, text: await readText(attachment.path) };
    }
  } catch {
    return undefined; // The file was deleted. Send the rest.
  }
}

/** The history before an answer → the request body. Files are read from disk here. */
export async function buildChatRequest(history: Message[]): Promise<ChatRequest> {
  const messages: ChatTurn[] = [];
  for (const message of history) {
    if (message.role === 'user') {
      // A message that never reached the server is not part of the conversation.
      if (message.status === 'failed') continue;
      const files = await Promise.all(message.attachments.map(toTurnAttachment));
      const attachments = files.filter((file): file is TurnAttachment => file !== undefined);
      const missing = message.attachments.length - attachments.length;
      const note = missing > 0 ? `\n\n(${missing} attached file(s) are no longer available.)` : '';
      messages.push({ role: 'user', text: message.text + note, attachments });
    } else {
      messages.push({
        role: 'assistant',
        text: message.text,
        createdImages: message.images.map((image) => ({ alt: image.alt })),
      });
    }
  }
  return { messages };
}
