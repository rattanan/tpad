export type AiProgress = { stage: string; label: string; detail: string; percent: number };

export async function readAiProgressResponse<TResult>(response: Response, onProgress: (progress: AiProgress) => void) {
  if (!response.ok) {
    const body = await response.json() as { error?: string };
    throw new Error(body.error ?? "AI generation could not be completed");
  }
  if (!response.body) throw new Error("Live progress connection was not available");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: TResult | null = null;
  const consume = (block: string) => {
    const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
    const raw = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!event || !raw) return;
    const payload = JSON.parse(raw) as AiProgress & TResult & { error?: string; requestId?: string; progressLabel?: string };
    if (event === "progress") onProgress(payload);
    if (event === "complete") result = payload;
    if (event === "failure") throw new Error(`${payload.error ?? "AI generation could not be completed"}${payload.progressLabel ? ` Last step: ${payload.progressLabel}.` : ""}${payload.requestId ? ` Reference: ${payload.requestId}` : ""}`);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) consume(block);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  if (!result) throw new Error("AI generation ended before a result was returned");
  return result as TResult;
}
