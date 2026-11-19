// SERVER ONLY. The mock backend's brain: it turns the app's contract into Claude API calls.
// Everything Claude-specific (model, content blocks, tools, errors) lives in this file,
// so swapping in the real backend later never touches the app.
import Anthropic from '@anthropic-ai/sdk';

import type { ChatEvent, ChatFinish, ChatRequest, ChatTurn, CreatedImage } from '@/api/contract';
import type { ServerConfig } from '@/server/config';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

const MAX_TOKENS = 64000;
// Turns the API's refusals into a retry on a fallback model, inside the same call.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let cachedClient: { key: string; client: Anthropic } | undefined;

function clientFor(apiKey: string) {
  if (cachedClient?.key !== apiKey) {
    cachedClient = { key: apiKey, client: new Anthropic({ apiKey }) };
  }
  return cachedClient.client;
}

// ---------- Request checking ----------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Checks the app's request. Returns an error message, or undefined when it is fine. */
export function checkChatRequest(body: unknown): string | undefined {
  if (!isObject(body) || !Array.isArray(body.messages) || body.messages.length === 0) {
    return 'The request needs a non-empty "messages" list.';
  }
  for (const turn of body.messages) {
    if (!isObject(turn) || (turn.role !== 'user' && turn.role !== 'assistant')) {
      return 'Each message needs a role of "user" or "assistant".';
    }
    if (typeof turn.text !== 'string') return 'Each message needs a "text" string.';
    if (turn.attachments !== undefined && !Array.isArray(turn.attachments)) {
      return '"attachments" must be a list.';
    }
  }
  const last = body.messages[body.messages.length - 1] as ChatTurn;
  if (last.role !== 'user') return 'The last message must come from the user.';
  return undefined;
}

// ---------- Contract → Claude messages ----------

function userContent(turn: ChatTurn): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  // Files go before the question: Claude answers better that way.
  for (const file of turn.attachments ?? []) {
    if (file.kind === 'image') {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: file.data },
      });
    } else if (file.kind === 'pdf') {
      blocks.push({
        type: 'document',
        title: file.name,
        source: { type: 'base64', media_type: 'application/pdf', data: file.data },
      });
    } else if (file.kind === 'text') {
      blocks.push({
        type: 'document',
        title: file.name,
        source: { type: 'text', media_type: 'text/plain', data: file.text || '(empty file)' },
      });
    }
  }
  const text = turn.text.trim();
  if (text) blocks.push({ type: 'text', text });
  // A turn with files but no words still needs some text.
  if (blocks.length > 0 && !text) blocks.push({ type: 'text', text: '(No message, only files.)' });
  return blocks;
}

function assistantText(turn: ChatTurn) {
  const parts = [turn.text.trim()];
  for (const image of turn.createdImages ?? []) {
    parts.push(`[I created an image: ${image.alt}]`);
  }
  return parts.filter(Boolean).join('\n\n');
}

/** The app's plain history → Claude messages. Empty turns are skipped. */
export function toClaudeMessages(turns: ChatTurn[]): MessageParam[] {
  const messages: MessageParam[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      const content = userContent(turn);
      if (content.length > 0) messages.push({ role: 'user', content });
    } else {
      const text = assistantText(turn);
      // The conversation must start with the user, and empty answers (stopped early) are left out.
      if (text && messages.length > 0) messages.push({ role: 'assistant', content: text });
    }
  }
  return messages;
}

// ---------- The system prompt ----------

const BASE_PROMPT = `You are Bentobox, a friendly and capable AI assistant inside a mobile chat app.

How to answer:
- People read your answers on a phone. Lead with the answer. Keep it short and easy to scan.
- Use Markdown: short paragraphs, bullet lists, and **bold** for key words. Use headings only in long answers.
- Put code in fenced code blocks with a language tag.
- Keep tables small (3 columns or fewer) when you can.
- When the user attaches photos or documents, look at them carefully and refer to what you see.
- If you are not sure about something, say so. Never make up facts, links or numbers.
- Do not make claims about this app's privacy, security or data handling.`;

const IMAGE_PROMPT = `
- You can make pictures with the create_image tool. Use it when the user asks you to create, draw, design or generate an image, picture, illustration, logo, icon or poster. Your pictures are vector art (SVG), not photos. If the user asks for a photo, make the best illustration you can and say in one short line that it is an illustration.`;

function systemPrompt(config: ServerConfig) {
  const today = new Date().toDateString();
  return `${BASE_PROMPT}${config.imageGeneration ? IMAGE_PROMPT : ''}\n\nToday's date is ${today}.`;
}

// ---------- The "Create an image" stand-in ----------

const CREATE_IMAGE_TOOL: Anthropic.Beta.BetaTool = {
  name: 'create_image',
  description: `Draws a picture for the user as an SVG image. The picture is shown in the chat right after your message.

Rules for the SVG:
- Start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"> (another viewBox size is fine for wide or tall pictures).
- Use only these elements: g, rect, circle, ellipse, line, polyline, polygon, path, text, defs, linearGradient, radialGradient, stop, clipPath.
- Set colors with attributes such as fill="#4F46E5" and stroke="#111111". Do not use <style>, CSS classes, filters, <image>, <foreignObject>, scripts or links.
- Fill the whole canvas with a background. Make it rich and detailed, but keep the SVG under 20,000 characters.`,
  input_schema: {
    type: 'object',
    properties: {
      alt: {
        type: 'string',
        description: 'One sentence that describes the picture, for people who cannot see it.',
      },
      svg: { type: 'string', description: 'The complete SVG document.' },
    },
    required: ['alt', 'svg'],
  },
  eager_input_streaming: true,
};

const MAX_SVG_LENGTH = 200_000;

/** Checks Claude's SVG and removes anything that is not plain drawing. */
function cleanSvg(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_SVG_LENGTH) return undefined;
  const start = raw.indexOf('<svg');
  const end = raw.lastIndexOf('</svg>');
  if (start === -1 || end === -1 || end < start) return undefined;
  return raw
    .slice(start, end + '</svg>'.length)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
}

function readSize(svg: string) {
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(
    svg,
  );
  const width = Number(viewBox?.[1]);
  const height = Number(viewBox?.[2]);
  return width > 0 && height > 0 ? { width, height } : { width: 1024, height: 1024 };
}

function imagesFrom(message: Anthropic.Beta.BetaMessage): CreatedImage[] {
  const images: CreatedImage[] = [];
  for (const block of message.content) {
    if (block.type !== 'tool_use' || block.name !== CREATE_IMAGE_TOOL.name) continue;
    // With eager input streaming the API does not check tool input, so check it here.
    const input = isObject(block.input) ? block.input : {};
    const svg = cleanSvg(input.svg);
    if (!svg) continue;
    const alt =
      typeof input.alt === 'string' && input.alt.trim() ? input.alt.trim() : 'Generated image';
    images.push({ id: block.id, alt, svg, ...readSize(svg) });
  }
  return images;
}

// ---------- Errors ----------

/** A short message the app can show under "The answer stopped." */
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'The AI key is not valid. Check AI_API_KEY in .env.';
  }
  if (error instanceof Anthropic.PaymentRequiredError) {
    return 'The AI account has no credit left.';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'This AI key is not allowed to use this model.';
  }
  if (error instanceof Anthropic.NotFoundError) {
    return 'The AI model was not found. Check AI_MODEL in .env.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Too many requests right now. Wait a moment and try again.';
  }
  if (error instanceof Anthropic.ContentTooLargeError) {
    return 'The files are too large. Try fewer or smaller files.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The AI could not read this request. ${error.message}`;
  }
  if (error instanceof Anthropic.InternalServerError) {
    return 'The AI service is busy. Try again in a moment.';
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Can't reach the AI service. Check the computer's internet connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `The AI service returned an error (${error.status ?? 'unknown'}).`;
  }
  return 'Something went wrong on the server.';
}

// ---------- Streaming an answer ----------

function finishFor(stopReason: string | null | undefined): ChatFinish {
  if (stopReason === 'max_tokens' || stopReason === 'model_context_window_exceeded') {
    return 'length';
  }
  if (stopReason === 'refusal') return 'refused';
  return 'complete';
}

type StreamAnswerOptions = {
  config: ServerConfig & { aiApiKey: string };
  request: ChatRequest;
  send: (event: ChatEvent) => void;
  signal: AbortSignal;
};

/** Streams one answer from Claude as contract events. Never throws. */
export async function streamAnswer({ config, request, send, signal }: StreamAnswerOptions) {
  const messages = toClaudeMessages(request.messages);
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    send({ type: 'error', message: 'There is no question to answer.' });
    return;
  }

  try {
    const stream = clientFor(config.aiApiKey).beta.messages.stream(
      {
        model: config.model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(config),
        messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: config.effort },
        // Caches the conversation so far. Later turns re-read it at a tenth of the price.
        cache_control: { type: 'ephemeral' },
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        tools: config.imageGeneration ? [CREATE_IMAGE_TOOL] : undefined,
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        send({ type: 'text', delta: event.delta.text });
      } else if (
        event.type === 'content_block_start' &&
        event.content_block.type === 'tool_use' &&
        event.content_block.name === CREATE_IMAGE_TOOL.name
      ) {
        send({ type: 'status', status: 'creating_image' });
      }
    }

    const message = await stream.finalMessage();
    // A refusal or a cut-off answer can leave a half-written picture. Never show one.
    if (message.stop_reason === 'tool_use') {
      for (const image of imagesFrom(message)) send({ type: 'image', image });
    }
    send({ type: 'done', finish: finishFor(message.stop_reason) });
  } catch (error) {
    if (signal.aborted || error instanceof Anthropic.APIUserAbortError) {
      console.log('[api/chat] The app stopped the answer.');
      return;
    }
    console.error('[api/chat]', error);
    send({ type: 'error', message: describeError(error) });
  }
}

// ---------- Chat titles ----------

/** A short title for a new chat, from its first question and answer. */
export async function makeTitle(
  config: ServerConfig & { aiApiKey: string },
  userText: string,
  assistantText: string,
) {
  const message = await clientFor(config.aiApiKey).beta.messages.create({
    model: config.model,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system:
      'You name chats. Reply with only a title of 2 to 5 words in the language of the chat. No quotes, no emoji, no period at the end.',
    messages: [
      {
        role: 'user',
        content: `Name this chat.\n\nUser: ${userText.slice(0, 1500)}\n\nAssistant: ${assistantText.slice(0, 1500)}`,
      },
    ],
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  });
  if (message.stop_reason === 'refusal') return undefined;
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '')
    .split('\n')[0]
    .trim();
  return text ? text.slice(0, 60) : undefined;
}
