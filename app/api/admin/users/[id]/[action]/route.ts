import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, HttpError } from "@/lib/http";
import { writeAudit } from "@/lib/auth/audit";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requirePermission, revokeUserSessions } from "@/lib/auth/session";
import { getUser, updateUser } from "@/lib/users/service";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(request: NextRequest, context: Context) { const meta = getRequestMeta(request); try { if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED"); const session = await requirePermission(request, "MANAGE_USERS"); const { id, action } = await context.params; if (action === "revoke-sessions") { const target = await getUser(id); if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND"); await revokeUserSessions(id); await writeAudit({ actor: session.user, action: "SESSIONS_REVOKED", category: "SECURITY", targetType: "USER", targetId: id, targetName: target.email, meta }); return NextResponse.json({ success: true }); } const statuses = { lock: "LOCKED", unlock: "ACTIVE", enable: "ACTIVE", disable: "INACTIVE" } as const; const status = statuses[action as keyof typeof statuses]; if (!status) throw new HttpError(404, "Action not found", "ACTION_NOT_FOUND"); const user = await updateUser(id, { status }, session.user, meta); return NextResponse.json({ user }); } catch (error) { return apiError(error, meta.requestId); } }
