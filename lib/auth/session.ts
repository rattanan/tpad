import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions, users, type Role } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import { authConfig } from "./config";
import { hasPermission, type Permission } from "./permissions";
import type { RequestMeta } from "./request";

export const SESSION_COOKIE = "atlas_session";
export const sessionCookieOptions = (expires: Date) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires, priority: "high" as const });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, meta: RequestMeta, rememberMe = false) {
  const token = randomBytes(32).toString("base64url");
  const hours = rememberMe ? authConfig.rememberMeMaxAgeHours : authConfig.sessionMaxAgeHours;
  const now = new Date(); const expiresAt = new Date(now.getTime() + hours * 3600000);
  await db.insert(sessions).values({ id: randomUUID(), userId, sessionTokenHash: hashToken(token), ipAddress: meta.ipAddress, userAgent: meta.userAgent, lastActiveAt: now, expiresAt, createdAt: now });
  return { token, expiresAt };
}

export type AuthenticatedUser = { id: string; fullName: string; username: string; email: string; role: Role; mustChangePassword: boolean };
export async function getSessionByToken(token?: string) {
  if (!token) return null;
  const now = new Date();
  const rows = await db.select({ sessionId: sessions.id, userId: users.id, fullName: users.fullName, username: users.username, email: users.email, role: users.role, status: users.status, mustChangePassword: users.mustChangePassword, expiresAt: sessions.expiresAt }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.sessionTokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))).limit(1);
  const row = rows[0];
  if (!row || row.status !== "ACTIVE") return null;
  await db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, row.sessionId));
  return { sessionId: row.sessionId, user: { id: row.userId, fullName: row.fullName, username: row.username, email: row.email, role: row.role, mustChangePassword: row.mustChangePassword } satisfies AuthenticatedUser, expiresAt: row.expiresAt };
}
export async function getSession(request: NextRequest) { return getSessionByToken(request.cookies.get(SESSION_COOKIE)?.value); }
export async function getCurrentSession() { return getSessionByToken((await cookies()).get(SESSION_COOKIE)?.value); }

export async function requireSession(request: NextRequest) {
  const session = await getSession(request);
  if (!session) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return session;
}
export async function requirePermission(request: NextRequest, permission: Permission) {
  const session = await requireSession(request);
  if (!hasPermission(session.user.role, permission)) throw new HttpError(403, "You do not have permission to perform this action", "FORBIDDEN");
  return session;
}
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  const now = new Date();
  const condition = exceptSessionId ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), /* deliberate inequality via sql avoided by filtering below */ gt(sessions.expiresAt, now)) : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  if (!exceptSessionId) return db.update(sessions).set({ revokedAt: now }).where(condition);
  const active = await db.select({ id: sessions.id }).from(sessions).where(condition);
  for (const item of active) if (item.id !== exceptSessionId) await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, item.id));
}
export async function revokeSession(sessionId: string) { await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId)); }
export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) { response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt)); }
export function clearSessionCookie(response: NextResponse) { response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 }); }
