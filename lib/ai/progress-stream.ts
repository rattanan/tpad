import { HttpError } from "@/lib/http";

type StreamOptions<TProgress, TResult> = {
  requestId?: string;
  run: (report: (progress: TProgress) => void) => Promise<TResult>;
  onComplete?: (result: TResult) => Promise<void>;
};

export function createAiProgressStream<TProgress, TResult>({ requestId, run, onComplete }: StreamOptions<TProgress, TResult>) {
  const encoder = new TextEncoder();
  let streamOpen = true;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, value: unknown) => {
        if (streamOpen) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      heartbeat = setInterval(() => { if (streamOpen) controller.enqueue(encoder.encode(": keep-alive\n\n")); }, 10_000);
      void (async () => {
        try {
          const result = await run((progress) => send("progress", progress));
          await onComplete?.(result);
          send("complete", result);
        } catch (error) {
          if (error instanceof HttpError) send("failure", { error: error.message, code: error.code });
          else {
            console.error("Streaming AI generation failed", { requestId, name: error instanceof Error ? error.name : "UnknownError" });
            send("failure", { error: "An unexpected error occurred", code: "INTERNAL_ERROR", requestId });
          }
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          if (streamOpen) { streamOpen = false; controller.close(); }
        }
      })();
    },
    cancel() {
      streamOpen = false;
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
