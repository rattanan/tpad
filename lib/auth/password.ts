import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { authConfig } from "./config";

const commonPasswords = new Set(["password", "password123", "1234567890", "qwerty12345", "admin12345", "letmein1234", "welcome123"]);

export function validatePassword(password: string, identity?: { username?: string; email?: string }) {
  const errors: string[] = [];
  if (password.length < 10) errors.push("Password must be at least 10 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain a special character");
  const normalized = password.toLowerCase();
  if (commonPasswords.has(normalized)) errors.push("Password is too common");
  if (identity?.username && normalized === identity.username.toLowerCase()) errors.push("Password cannot match username");
  if (identity?.email && normalized === identity.email.toLowerCase()) errors.push("Password cannot match email");
  return errors;
}

export const hashPassword = (password: string) => hash(password, authConfig.bcryptRounds);
export const verifyPassword = (password: string, passwordHash: string) => compare(password, passwordHash);
export const generateTemporaryPassword = () => `A!${randomBytes(12).toString("base64url")}9z`;
