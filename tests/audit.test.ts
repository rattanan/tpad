import { describe, expect, it } from "vitest";
import { maskSensitive } from "../lib/auth/mask";

describe("audit log masking", () => {
  it("redacts passwords, tokens, secrets, API keys and connection strings recursively", () => { const result = maskSensitive({ role: "ADMIN", password: "secret", nested: { accessToken: "token", apiKey: "key", connectionString: "mysql://secret", safe: "visible" } }); expect(result).toEqual({ role: "ADMIN", password: "[REDACTED]", nested: { accessToken: "[REDACTED]", apiKey: "[REDACTED]", connectionString: "[REDACTED]", safe: "visible" } }); });
  it("does not alter ordinary audit values", () => expect(maskSensitive({ role: "VIEWER", status: "ACTIVE" })).toEqual({ role: "VIEWER", status: "ACTIVE" }));
});
