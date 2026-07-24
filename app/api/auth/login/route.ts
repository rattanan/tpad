import { eq, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { apiError, HttpError } from "@/lib/http";
import { writeAudit } from "@/lib/auth/audit";
import { authConfig } from "@/lib/auth/config";
import { writeLoginHistory } from "@/lib/auth/history";
import { clearIpFailures, isIpBlocked, registerIpFailure } from "@/lib/auth/rate-limit";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/validation";
import { verifyPassword } from "@/lib/auth/password";

const genericMessage = "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง";
export async function POST(request: NextRequest) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const input = loginSchema.parse(await request.json()); const identifier = input.identifier.toLowerCase();
    if (await isIpBlocked(meta.ipAddress)) { await writeLoginHistory({ identifier, eventType: "LOGIN", status: "LOCKED", failureReason: "Rate limit exceeded", meta }); throw new HttpError(429, genericMessage, "LOGIN_RATE_LIMITED"); }
    const user = (await db.select().from(users).where(or(eq(users.email, identifier), eq(users.username, identifier))).limit(1))[0];
    const now = new Date();
    const expiredTemporaryLock = Boolean(user?.status === "LOCKED" && user.lockedUntil && user.lockedUntil <= now);
    if (user && expiredTemporaryLock) await db.update(users).set({ status: "ACTIVE", lockedUntil: null, failedLoginAttempts: 0, updatedAt: now }).where(eq(users.id, user.id));
    const unavailable = !user || user.status === "INACTIVE" || user.status === "ARCHIVED" || (user.status === "LOCKED" && !expiredTemporaryLock);
    const validPassword = user ? await verifyPassword(input.password, user.passwordHash) : false;
    if (unavailable || !validPassword) {
      await registerIpFailure(meta.ipAddress);
      let locked = unavailable && user?.status === "LOCKED";
      if (user && !unavailable) {
        const windowStart = user.failedLoginWindowStartedAt && now.getTime() - user.failedLoginWindowStartedAt.getTime() <= authConfig.loginWindowMinutes * 60000 ? user.failedLoginWindowStartedAt : now;
        const attempts = windowStart === user.failedLoginWindowStartedAt ? user.failedLoginAttempts + 1 : 1;
        locked = attempts >= authConfig.maxLoginAttempts;
        await db.update(users).set({ failedLoginAttempts: attempts, failedLoginWindowStartedAt: windowStart, status: locked ? "LOCKED" : user.status, lockedUntil: locked ? new Date(now.getTime() + authConfig.accountLockMinutes * 60000) : user.lockedUntil, updatedAt: now }).where(eq(users.id, user.id));
      }
      await writeLoginHistory({ userId: user?.id, identifier, eventType: "LOGIN", status: locked ? "LOCKED" : "FAILED", failureReason: unavailable ? "Account unavailable" : "Invalid credentials", meta });
      await writeAudit({ actor: user ? { id: user.id, fullName: user.fullName } : null, action: "LOGIN_FAILED", category: "AUTHENTICATION", targetType: "USER", targetId: user?.id, targetName: identifier, result: "FAILED", description: genericMessage, meta });
      throw new HttpError(401, genericMessage, "INVALID_CREDENTIALS");
    }
    await clearIpFailures(meta.ipAddress);
    await db.update(users).set({ status: expiredTemporaryLock ? "ACTIVE" : user.status, failedLoginAttempts: 0, failedLoginWindowStartedAt: null, lockedUntil: null, lastLoginAt: now, updatedAt: now }).where(eq(users.id, user.id));
    const session = await createSession(user.id, meta, input.rememberMe);
    await writeLoginHistory({ userId: user.id, identifier, eventType: "LOGIN", status: "SUCCESS", meta });
    await writeAudit({ actor: { id: user.id, fullName: user.fullName }, action: "LOGIN_SUCCESS", category: "AUTHENTICATION", targetType: "USER", targetId: user.id, targetName: user.email, meta });
    const response = NextResponse.json({ user: { id: user.id, fullName: user.fullName, username: user.username, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword }, redirectTo: user.mustChangePassword ? "/change-password" : user.role === "ADMIN" ? "/admin/users" : "/profile" });
    setSessionCookie(response, session.token, session.expiresAt); response.headers.set("x-request-id", meta.requestId); return response;
  } catch (error) { return apiError(error, meta.requestId); }
}
