// SERVER ONLY. This file reads secret keys from `.env`.
// Import it only from `src/server/*` and `src/app/api/*+api.ts`, never from app code.
//
// `npx expo start` loads `.env` when it starts. After editing `.env`, restart it.

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readServerConfig() {
  const effort = clean(process.env.AI_EFFORT) as Effort | undefined;

  return {
    /** The Claude API key. Required for chat. */
    aiApiKey: clean(process.env.AI_API_KEY),
    model: clean(process.env.AI_MODEL) ?? 'claude-opus-5-5',
    /** How hard Claude thinks. `low` keeps chat replies fast; `medium` or `high` think deeper. */
    effort: effort && EFFORTS.includes(effort) ? effort : ('low' as Effort),
    /** Turn the SVG "Create an image" stand-in off with AI_IMAGES=off. */
    imageGeneration: clean(process.env.AI_IMAGES) !== 'off',
    /**
     * Speech-to-text for the mic. Claude cannot hear audio, so voice input needs a
     * second provider with an OpenAI-style `/audio/transcriptions` endpoint
     * (OpenAI, or Groq, which has a free tier).
     */
    stt: {
      apiKey: clean(process.env.STT_API_KEY),
      baseUrl: (clean(process.env.STT_BASE_URL) ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
      model: clean(process.env.STT_MODEL) ?? 'whisper-1',
    },
  };
}

export type ServerConfig = ReturnType<typeof readServerConfig>;
