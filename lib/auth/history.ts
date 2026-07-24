import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { loginHistory } from "@/lib/db/schema";
import type { RequestMeta } from "./request";

export async function writeLoginHistory(input: { userId?: string; identifier: string; eventType: "LOGIN" | "LOGOUT" | "SESSION"; status: "SUCCESS" | "FAILED" | "LOCKED" | "LOGOUT" | "SESSION_EXPIRED"; failureReason?: string; meta: RequestMeta }) {
  const now = new Date();
  await db.insert(loginHistory).values({ id: randomUUID(), userId: input.userId, loginIdentifier: input.identifier.slice(0, 190), eventType: input.eventType, status: input.status, ipAddress: input.meta.ipAddress, userAgent: input.meta.userAgent, browser: input.meta.browser, operatingSystem: input.meta.operatingSystem, deviceType: input.meta.deviceType, failureReason: input.failureReason, loggedInAt: input.eventType === "LOGIN" ? now : undefined, loggedOutAt: input.eventType === "LOGOUT" ? now : undefined, createdAt: now });
}
