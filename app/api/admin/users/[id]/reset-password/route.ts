import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, HttpError } from "@/lib/http";
import { generateTemporaryPassword } from "@/lib/auth/password";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requirePermission } from "@/lib/auth/session";
import { resetPasswordSchema } from "@/lib/auth/validation";
import { resetUserPassword } from "@/lib/users/service";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) { const meta = getRequestMeta(request); try { if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED"); const session = await requirePermission(request, "MANAGE_USERS"); const input = resetPasswordSchema.parse(await request.json()); const password = input.generate ? generateTemporaryPassword() : input.password!; await resetUserPassword((await context.params).id, password, session.user, meta); return NextResponse.json({ success: true, ...(input.generate ? { temporaryPassword: password } : {}) }); } catch (error) { return apiError(error, meta.requestId); } }
