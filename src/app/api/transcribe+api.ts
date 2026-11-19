// MOCK BACKEND: POST /api/transcribe → turns a voice recording into text.
//
// Claude cannot hear audio, so this route uses a separate speech-to-text service with an
// OpenAI-style API. Add to .env (then restart `npx expo start`):
//   STT_API_KEY=...            (required)
//   STT_BASE_URL=...           (optional, default https://api.openai.com/v1)
//   STT_MODEL=...              (optional, default whisper-1)
// Groq has a free tier: STT_BASE_URL=https://api.groq.com/openai/v1, STT_MODEL=whisper-large-v3-turbo
import type { TranscribeResponse } from '@/api/contract';
import { readServerConfig } from '@/server/config';
import { errorResponse, readJson } from '@/server/http';

// About 10 minutes of speech. Longer recordings are refused.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/3gpp': '3gp',
};

function decodeBase64(text: string) {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const { stt } = readServerConfig();
  if (!stt.apiKey) {
    return errorResponse(501, 'Voice input is off. Add STT_API_KEY to .env to turn it on.');
  }

  const body = (await readJson(request)) as { audio?: unknown; mimeType?: unknown } | undefined;
  if (typeof body?.audio !== 'string' || typeof body.mimeType !== 'string') {
    return errorResponse(400, 'The request needs "audio" (base64) and "mimeType" strings.');
  }

  const bytes = decodeBase64(body.audio);
  if (!bytes || bytes.length === 0) return errorResponse(400, 'The recording is empty.');
  if (bytes.length > MAX_AUDIO_BYTES) return errorResponse(413, 'The recording is too long.');

  const mimeType = body.mimeType.split(';')[0].trim().toLowerCase();
  const extension = EXTENSIONS[mimeType] ?? 'm4a';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), `voice.${extension}`);
  form.append('model', stt.model);

  try {
    const response = await fetch(`${stt.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stt.apiKey}` },
      body: form,
      signal: request.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[api/transcribe]', response.status, detail.slice(0, 500));
      const message =
        response.status === 401
          ? 'The speech-to-text key is not valid. Check STT_API_KEY in .env.'
          : 'The speech-to-text service could not read this recording.';
      return errorResponse(502, message);
    }
    const result = (await response.json()) as { text?: unknown };
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    const reply: TranscribeResponse = { text };
    return Response.json(reply);
  } catch (error) {
    console.error('[api/transcribe]', error);
    return errorResponse(502, "Can't reach the speech-to-text service.");
  }
}
