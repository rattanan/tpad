import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from "../lib/auth/password";

describe("password security", () => {
  it("enforces all password complexity requirements", () => expect(validatePassword("short").length).toBeGreaterThanOrEqual(4));
  it("accepts a strong password", () => expect(validatePassword("Correct!Horse9Battery")).toEqual([]));
  it("rejects username and email matches", () => { expect(validatePassword("UserName", { username: "username" })).toContain("Password cannot match username"); expect(validatePassword("Person@Example.com", { email: "person@example.com" })).toContain("Password cannot match email"); });
  it("hashes passwords without retaining plaintext", async () => { const value = "Correct!Horse9Battery"; const hashed = await hashPassword(value); expect(hashed).not.toContain(value); expect(await verifyPassword(value, hashed)).toBe(true); });
  it("generates policy-compliant temporary passwords", () => expect(validatePassword(generateTemporaryPassword())).toEqual([]));
});
