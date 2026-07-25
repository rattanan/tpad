import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedCredential = { encryptedPassword: string; passwordIv: string; passwordAuthTag: string; passwordKeyVersion: string };

function key(version = process.env.DATA_SOURCE_ENCRYPTION_KEY_VERSION || "v1") {
  const versionedName = `DATA_SOURCE_ENCRYPTION_KEY_${version.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
  const raw = process.env[versionedName] || process.env.DATA_SOURCE_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_SOURCE_ENCRYPTION_KEY is required for data source credentials");
  const value = Buffer.from(raw, raw.length === 64 ? "hex" : "base64");
  if (value.length !== 32) throw new Error("DATA_SOURCE_ENCRYPTION_KEY must decode to 32 bytes");
  return value;
}

export function encryptCredential(password: string): EncryptedCredential {
  const passwordKeyVersion = process.env.DATA_SOURCE_ENCRYPTION_KEY_VERSION || "v1"; const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(passwordKeyVersion), iv);
  const encryptedPassword = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]).toString("base64");
  return { encryptedPassword, passwordIv: iv.toString("base64"), passwordAuthTag: cipher.getAuthTag().toString("base64"), passwordKeyVersion };
}
export function decryptCredential(value: EncryptedCredential) {
  const decipher = createDecipheriv("aes-256-gcm", key(value.passwordKeyVersion), Buffer.from(value.passwordIv, "base64"));
  decipher.setAuthTag(Buffer.from(value.passwordAuthTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.encryptedPassword, "base64")), decipher.final()]).toString("utf8");
}
