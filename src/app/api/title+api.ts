// MOCK BACKEND: POST /api/title → a short name for a new chat.
import type { TitleResponse } from '@/api/contract';
import { describeError, makeTitle } from '@/server/claude';
import { readServerConfig } from '@/server/config';
import { errorResponse, readJson } from '@/server/http';

export async function POST(request: Request) {
  const config = readServerConfig();
  const { aiApiKey } = config;
  if (!aiApiKey) return errorResponse(500, 'The server has no AI key. Add AI_API_KEY to .env.');

  const body = await readJson(request);
  const userText = (body as { userText?: unknown } | undefined)?.userText;
  const assistantText = (body as { assistantText?: unknown } | undefined)?.assistantText;
  if (typeof userText !== 'string' || typeof assistantText !== 'string') {
    return errorResponse(400, 'The request needs "userText" and "assistantText" strings.');
  }

  try {
    const title = await makeTitle({ ...config, aiApiKey }, userText, assistantText);
    if (!title) return errorResponse(422, 'No title for this chat.');
    const response: TitleResponse = { title };
    return Response.json(response);
  } catch (error) {
    console.error('[api/title]', error);
    return errorResponse(502, describeError(error));
  }
}
