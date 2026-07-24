import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export type RequestMeta = { ipAddress: string; userAgent: string; requestId: string; browser: string; operatingSystem: string; deviceType: string };

export function parseUserAgent(userAgent: string) {
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Other";
  const operatingSystem = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "Other";
  const deviceType = /Mobile|Android|iPhone/.test(userAgent) ? "Mobile" : /iPad|Tablet/.test(userAgent) ? "Tablet" : "Desktop";
  return { browser, operatingSystem, deviceType };
}

export function getRequestMeta(request: NextRequest): RequestMeta {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = forwarded || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return { ipAddress, userAgent, requestId: request.headers.get("x-request-id") || randomUUID(), ...parseUserAgent(userAgent) };
}

export function hashIp(ipAddress: string) { return createHash("sha256").update(ipAddress).digest("hex"); }

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
