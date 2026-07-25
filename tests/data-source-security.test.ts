import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential } from "../lib/data-sources/credentials";
import { maskValue, suggestSensitivity } from "../lib/data-sources/masking";
import { oracleSafeError } from "../lib/data-sources/oracle";
import { dataSourceInputSchema, previewSchema } from "../lib/data-sources/validation";

describe("data source credential security", () => {
  const previous = process.env.DATA_SOURCE_ENCRYPTION_KEY;
  beforeEach(() => { process.env.DATA_SOURCE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
  afterEach(() => { if (previous === undefined) delete process.env.DATA_SOURCE_ENCRYPTION_KEY; else process.env.DATA_SOURCE_ENCRYPTION_KEY = previous; });
  it("encrypts with AES-GCM and a fresh IV", () => { const first = encryptCredential("oracle-secret"); const second = encryptCredential("oracle-secret"); expect(first.encryptedPassword).not.toBe("oracle-secret"); expect(first.passwordIv).not.toBe(second.passwordIv); expect(decryptCredential(first)).toBe("oracle-secret"); });
  it("rejects invalid encryption keys", () => { process.env.DATA_SOURCE_ENCRYPTION_KEY = "short"; expect(() => encryptCredential("secret")).toThrow(/32 bytes/); });
});
describe("Oracle request safety", () => {
  it.each([["ORA-01017", "AUTHENTICATION"], ["ORA-12541", "NO_LISTENER"], ["ORA-12170", "TIMEOUT"], ["ORA-28000", "ACCOUNT_LOCKED"]])("maps %s safely", (code, category) => { const mapped = oracleSafeError(new Error(`${code}: technical detail`)); expect(mapped.category).toBe(category); expect(mapped.message).not.toContain("technical detail"); });
  it("rejects credentials embedded in connection strings", () => { const result = dataSourceInputSchema.safeParse({ name: "IFS", environment: "UAT", connectionMode: "CONNECTION_STRING", connectionString: "user/password@host/service", username: "user", password: "secret" }); expect(result.success).toBe(false); });
  it("does not accept raw SQL in preview input", () => expect(previewSchema.safeParse({ rowLimit: 20, sql: "DROP TABLE X" }).success).toBe(false));
});
describe("sample masking", () => { it("never reveals credential columns", () => { expect(suggestSensitivity("API_TOKEN")).toBe("CREDENTIAL"); expect(maskValue("top-secret", "CREDENTIAL")).toBe("********"); }); it("masks email and phone values", () => { expect(maskValue("bob@example.com", "CONTACT")).toBe("bo***@example.com"); expect(maskValue("0812345634", "CONTACT")).toBe("08******34"); }); });
