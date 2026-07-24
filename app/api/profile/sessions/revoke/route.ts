import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { apiError, HttpError } from "@/lib/http";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
export async function POST(request: NextRequest) { const meta = getRequestMeta(request); try { if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED"); const session = await requireSession(request); const input = z.object({ sessionId: z.string().uuid() }).parse(await request.json()); if (input.sessionId === session.sessionId) throw new HttpError(400, "Use logout to end the current session"); await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, session.user.id))); return Response.json({ success: true }); } catch (error) { return apiError(error, meta.requestId); } }
