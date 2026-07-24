import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { getRequestMeta, parseUserAgent } from "@/lib/auth/request";
import { requireSession, revokeUserSessions } from "@/lib/auth/session";
export async function GET(request: NextRequest) { const meta = getRequestMeta(request); try { const session = await requireSession(request); const rows = await db.select({ id: sessions.id, ipAddress: sessions.ipAddress, userAgent: sessions.userAgent, lastActiveAt: sessions.lastActiveAt, expiresAt: sessions.expiresAt, createdAt: sessions.createdAt }).from(sessions).where(and(eq(sessions.userId, session.user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).orderBy(desc(sessions.lastActiveAt)); return Response.json({ items: rows.map(row => ({ ...row, current: row.id === session.sessionId, ...parseUserAgent(row.userAgent ?? "") })) }); } catch (error) { return apiError(error, meta.requestId); } }
export async function POST(request: NextRequest) { const meta = getRequestMeta(request); try { const session = await requireSession(request); await revokeUserSessions(session.user.id, session.sessionId); return Response.json({ success: true }); } catch (error) { return apiError(error, meta.requestId); } }
