// One function per backend endpoint. Screens and stores call these, never fetch() directly.
import { useQuery } from '@tanstack/react-query';

import { ApiError, errorFromResponse, getJson, postJson, request } from '@/api/client';
import type {
  Capabilities,
  ChatEvent,
  ChatRequest,
  TitleRequest,
  TitleResponse,
  TranscribeRequest,
  TranscribeResponse,
} from '@/api/contract';
import { createSseParser } from '@/api/sse';
import { features } from '@/lib/features';

/** The connection dropped after the answer had started. */
export class StreamBrokenError extends Error {
  constructor() {
    super('The connection dropped before the answer finished.');
    this.name = 'StreamBrokenError';
  }
}

type StreamChatOptions = {
  signal: AbortSignal;
  /** Called for every event, in order, as soon as it arrives. */
  onEvent: (event: ChatEvent) => void;
};

/**
 * POST /api/chat. Resolves when the stream ends.
 * Throws NetworkError / ApiError when the answer never started,
 * and StreamBrokenError when it broke halfway.
 */
export async function streamChat(body: ChatRequest, { signal, onEvent }: StreamChatOptions) {
  const response = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await errorFromResponse(response);

  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('This device cannot read streamed answers.', 0);

  const decoder = new TextDecoder();
  const parser = createSseParser((data) => {
    let event: ChatEvent;
    try {
      event = JSON.parse(data) as ChatEvent;
    } catch {
      return; // Skip a broken event instead of failing the whole answer.
    }
    onEvent(event);
  });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new StreamBrokenError();
  }
}

/** POST /api/transcribe: a voice recording (base64) → text. */
export function transcribe(body: TranscribeRequest, signal?: AbortSignal) {
  return postJson<TranscribeResponse>('/api/transcribe', body, signal);
}

/** POST /api/title: a short name for a new chat. */
export function fetchTitle(body: TitleRequest) {
  return postJson<TitleResponse>('/api/title', body);
}

const DEFAULT_CAPABILITIES: Capabilities = {
  voiceInput: false,
  imageGeneration: features.imageGeneration,
};

/**
 * GET /api/capabilities, cached for the session. Until it loads (or if it fails),
 * the defaults keep optional controls hidden.
 */
export function useCapabilities(): Capabilities {
  const { data } = useQuery({
    queryKey: ['capabilities'],
    queryFn: ({ signal }) => getJson<Capabilities>('/api/capabilities', signal),
    staleTime: 60_000,
    retry: 1,
  });
  return data ?? DEFAULT_CAPABILITIES;
}
