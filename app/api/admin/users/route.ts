import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { roleValues, statusValues, type Role, type UserStatus } from "@/lib/db/schema";
import { apiError, HttpError } from "@/lib/http";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requirePermission } from "@/lib/auth/session";
import { createUserSchema } from "@/lib/auth/validation";
import { createUser, listUsers } from "@/lib/users/service";

export async function GET(request: NextRequest) { const meta = getRequestMeta(request); try { await requirePermission(request, "MANAGE_USERS"); const q = request.nextUrl.searchParams; const role = q.get("role"); const status = q.get("status"); const page = Math.max(1, Number(q.get("page")) || 1); const pageSize = Math.min(100, Math.max(1, Number(q.get("pageSize")) || 10)); return NextResponse.json(await listUsers({ q: q.get("q")?.trim(), role: roleValues.includes(role as Role) ? role as Role : undefined, status: statusValues.includes(status as UserStatus) ? status as UserStatus : undefined, page, pageSize, sort: q.get("sort") || "createdAt", order: q.get("order") === "asc" ? "asc" : "desc" })); } catch (error) { return apiError(error, meta.requestId); } }
export async function POST(request: NextRequest) { const meta = getRequestMeta(request); try { if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED"); const session = await requirePermission(request, "MANAGE_USERS"); const input = createUserSchema.parse(await request.json()); const user = await createUser(input, session.user, meta); return NextResponse.json({ user }, { status: 201 }); } catch (error) { return apiError(error, meta.requestId); } }
