import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginRateLimits } from "@/lib/db/schema";
import { authConfig } from "./config";
import { hashIp } from "./request";

export async function isIpBlocked(ip: string) {
  const key = hashIp(ip); const row = (await db.select().from(loginRateLimits).where(eq(loginRateLimits.ipHash, key)).limit(1))[0];
  return Boolean(row?.blockedUntil && row.blockedUntil > new Date());
}
export async function registerIpFailure(ip: string) {
  const key = hashIp(ip); const now = new Date(); const windowMs = authConfig.loginWindowMinutes * 60000;
  const row = (await db.select().from(loginRateLimits).where(eq(loginRateLimits.ipHash, key)).limit(1))[0];
  const within = row && now.getTime() - row.windowStartedAt.getTime() <= windowMs;
  const attempts = within ? row.attempts + 1 : 1;
  const blockedUntil = attempts >= authConfig.maxLoginAttempts ? new Date(now.getTime() + authConfig.accountLockMinutes * 60000) : null;
  await db.insert(loginRateLimits).values({ ipHash: key, windowStartedAt: within ? row.windowStartedAt : now, attempts, blockedUntil, updatedAt: now }).onDuplicateKeyUpdate({ set: { windowStartedAt: within ? row.windowStartedAt : now, attempts, blockedUntil, updatedAt: now } });
}
export async function clearIpFailures(ip: string) { await db.delete(loginRateLimits).where(eq(loginRateLimits.ipHash, hashIp(ip))); }
