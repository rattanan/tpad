import { describe, expect, it } from "vitest";
import { aiRequestTimeoutMs } from "../lib/business-context/ai-config";

describe("AI assistance timeout", () => {
  it("uses a longer default for profiled KPI generation", () => {
    expect(aiRequestTimeoutMs(undefined)).toBe(90_000);
  });

  it("bounds configured timeouts to a safe range", () => {
    expect(aiRequestTimeoutMs("1000")).toBe(30_000);
    expect(aiRequestTimeoutMs("120000")).toBe(120_000);
    expect(aiRequestTimeoutMs("999999")).toBe(180_000);
  });

  it("falls back to the default for invalid values", () => {
    expect(aiRequestTimeoutMs("not-a-number")).toBe(90_000);
  });
});
