import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiProgressStream } from "../lib/ai/progress-stream";
import { readAiProgressResponse } from "../lib/ai/progress-client";

describe("AI progress stream server", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a completed result when the audit completion hook fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = createAiProgressStream({
      requestId: "request-456",
      run: async (report: (progress: { label: string }) => void) => { report({ label: "Done" }); return { dashboardId: "dashboard-1" }; },
      onComplete: async () => { throw new Error("Audit storage unavailable"); },
    });

    await expect(readAiProgressResponse<{ dashboardId: string }>(response, () => undefined)).resolves.toEqual({ dashboardId: "dashboard-1" });
  });

  it("returns a safe failure with the last completed step", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = createAiProgressStream({
      requestId: "request-789",
      failureMessage: "Dashboard generation could not finish.",
      run: async (report: (progress: { label: string }) => void) => { report({ label: "Verifying previews" }); throw new Error("Database detail"); },
    });

    await expect(readAiProgressResponse(response, () => undefined)).rejects.toThrow("Dashboard generation could not finish. Last step: Verifying previews. Reference: request-789");
  });
});
