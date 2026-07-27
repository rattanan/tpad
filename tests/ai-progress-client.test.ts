import { describe, expect, it } from "vitest";
import { readAiProgressResponse } from "../lib/ai/progress-client";

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } });
}

describe("AI progress stream client", () => {
  it("handles heartbeats and events split across network chunks", async () => {
    const progress: string[] = [];
    const response = streamResponse([": keep-alive\n\nevent: progress\ndata: {\"stage\":\"PROFILE\",\"label\":\"Profiling\",", "\"detail\":\"Checking data\",\"percent\":40}\n\nevent: complete\ndata: {\"createdCount\":2}\n\n"]);
    const result = await readAiProgressResponse<{ createdCount: number }>(response, (event) => progress.push(event.label));
    expect(progress).toEqual(["Profiling"]);
    expect(result).toEqual({ createdCount: 2 });
  });

  it("surfaces a streamed failure message", async () => {
    const response = streamResponse(["event: failure\ndata: {\"error\":\"No usable measures\"}\n\n"]);
    await expect(readAiProgressResponse(response, () => undefined)).rejects.toThrow("No usable measures");
  });
});
