// MOCK BACKEND: GET /api/capabilities → which optional features this backend supports.
// The app hides the mic and the "Create an image" tile when they are off.
import type { Capabilities } from '@/api/contract';
import { readServerConfig } from '@/server/config';

export function GET() {
  const config = readServerConfig();
  const capabilities: Capabilities = {
    voiceInput: Boolean(config.stt.apiKey),
    imageGeneration: Boolean(config.aiApiKey) && config.imageGeneration,
  };
  return Response.json(capabilities);
}
