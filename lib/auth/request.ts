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

function headerValues(value: string | null | undefined) {
  return value?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
}

function configuredOrigins() {
  return headerValues(process.env.TRUSTED_ORIGINS).flatMap((value) => {
    try {
      const origin = new URL(value);
      return origin.protocol === "http:" || origin.protocol === "https:" ? [origin.origin] : [];
    } catch {
      return [];
    }
  });
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;

    const forwardedProtocol = headerValues(request.headers.get("x-forwarded-proto"))[0];
    const protocol = forwardedProtocol === "https" ? "https:" : forwardedProtocol === "http" ? "http:" : request.nextUrl.protocol;
    const hosts = new Set([
      request.nextUrl.host,
      ...headerValues(request.headers.get("host")),
      ...headerValues(request.headers.get("x-forwarded-host")),
    ]);
    const requestOrigins = [...hosts].map((host) => `${protocol}//${host}`);

    return [...configuredOrigins(), ...requestOrigins].includes(originUrl.origin);
  } catch {
    return false;
  }
}
