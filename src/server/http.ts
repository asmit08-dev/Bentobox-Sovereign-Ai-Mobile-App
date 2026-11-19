// SERVER ONLY. Small helpers for the mock backend's responses.
import type { ApiErrorBody, ChatEvent } from '@/api/contract';

/** A JSON error the app can show: `{ error: { message } }`. */
export function errorResponse(status: number, message: string) {
  const body: ApiErrorBody = { error: { message } };
  return Response.json(body, { status });
}

/** Reads a JSON body, or returns undefined when it is not valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const encoder = new TextEncoder();

/**
 * Starts a Server-Sent Events response. `run` writes events with `send`.
 * The stream closes when `run` finishes. If the app hangs up (Stop button),
 * `signal` fires so `run` can stop the AI call.
 */
export function sseResponse(
  request: Request,
  run: (send: (event: ChatEvent) => void, signal: AbortSignal) => Promise<void>,
) {
  const abort = new AbortController();
  const onClientGone = () => abort.abort();
  request.signal?.addEventListener('abort', onClientGone);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The app already hung up.
          open = false;
        }
      };

      try {
        await run(send, abort.signal);
      } finally {
        request.signal?.removeEventListener('abort', onClientGone);
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Stops proxies (and the dev tunnel) from holding chunks back.
      'X-Accel-Buffering': 'no',
    },
  });
}
