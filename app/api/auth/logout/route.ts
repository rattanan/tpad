import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { writeAudit } from "@/lib/auth/audit";
import { writeLoginHistory } from "@/lib/auth/history";
import { getRequestMeta } from "@/lib/auth/request";
import { clearSessionCookie, requireSession, revokeSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) { const meta = getRequestMeta(request); try { const session = await requireSession(request); await revokeSession(session.sessionId); await writeLoginHistory({ userId: session.user.id, identifier: session.user.email, eventType: "LOGOUT", status: "LOGOUT", meta }); await writeAudit({ actor: session.user, action: "LOGOUT", category: "AUTHENTICATION", targetType: "SESSION", targetId: session.sessionId, meta }); const response = NextResponse.json({ success: true }); clearSessionCookie(response); return response; } catch (error) { return apiError(error, meta.requestId); } }
