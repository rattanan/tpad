import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, HttpError } from "@/lib/http";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requirePermission } from "@/lib/auth/session";
import { updateUserSchema } from "@/lib/auth/validation";
import { getUser, updateUser } from "@/lib/users/service";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { const meta = getRequestMeta(request); try { await requirePermission(request, "MANAGE_USERS"); const user = await getUser((await context.params).id); if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND"); return NextResponse.json({ user }); } catch (error) { return apiError(error, meta.requestId); } }
export async function PATCH(request: NextRequest, context: Context) { const meta = getRequestMeta(request); try { if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED"); const session = await requirePermission(request, "MANAGE_USERS"); const changes = updateUserSchema.parse(await request.json()); const user = await updateUser((await context.params).id, changes, session.user, meta); return NextResponse.json({ user }); } catch (error) { return apiError(error, meta.requestId); } }
