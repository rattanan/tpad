import { HttpError } from "../http";

type StreamOptions<TProgress, TResult> = {
  requestId?: string;
  run: (report: (progress: TProgress) => void) => Promise<TResult>;
  onComplete?: (result: TResult) => Promise<void>;
  failureMessage?: string;
};

export function createAiProgressStream<TProgress, TResult>({ requestId, run, onComplete, failureMessage = "AI generation could not be completed" }: StreamOptions<TProgress, TResult>) {
  const encoder = new TextEncoder();
  let streamOpen = true;
  let lastProgress: TProgress | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, value: unknown) => {
        if (streamOpen) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      heartbeat = setInterval(() => { if (streamOpen) controller.enqueue(encoder.encode(": keep-alive\n\n")); }, 10_000);
      void (async () => {
        try {
          const result = await run((progress) => { lastProgress = progress; send("progress", progress); });
          try {
            await onComplete?.(result);
          } catch (error) {
            // Completion hooks such as audit logging must not turn a successfully
            // generated artifact into a false failure for the user.
            console.error(`AI generation completion hook failed requestId=${requestId ?? "unknown"} name=${error instanceof Error ? error.name : "UnknownError"} message=${error instanceof Error ? error.message : "Unknown completion hook error"}`);
          }
          send("complete", result);
        } catch (error) {
          if (error instanceof HttpError) send("failure", { error: error.message, code: error.code });
          else {
            console.error(`Streaming AI generation failed requestId=${requestId ?? "unknown"} name=${error instanceof Error ? error.name : "UnknownError"} message=${error instanceof Error ? error.message : "Unknown generation error"}${error instanceof Error && error.stack ? `\n${error.stack}` : ""}`);
            const progressLabel = lastProgress && typeof lastProgress === "object" && "label" in lastProgress && typeof lastProgress.label === "string" ? lastProgress.label : undefined;
            send("failure", { error: failureMessage, code: "INTERNAL_ERROR", requestId, progressLabel });
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
