// MOCK BACKEND: POST /api/chat → streams an answer from Claude.
// It runs inside the Expo dev server, so it only works while `npx expo start` is running.
// The real backend will replace it. The contract is in src/api/contract.ts.
import type { ChatRequest } from '@/api/contract';
import { checkChatRequest, streamAnswer } from '@/server/claude';
import { readServerConfig } from '@/server/config';
import { errorResponse, readJson, sseResponse } from '@/server/http';

export async function POST(request: Request) {
  const config = readServerConfig();
  const { aiApiKey } = config;
  if (!aiApiKey) {
    return errorResponse(500, 'The server has no AI key. Add AI_API_KEY to .env.');
  }

  const body = await readJson(request);
  const problem = checkChatRequest(body);
  if (problem) return errorResponse(400, problem);

  return sseResponse(request, (send, signal) =>
    streamAnswer({ config: { ...config, aiApiKey }, request: body as ChatRequest, send, signal }),
  );
}
