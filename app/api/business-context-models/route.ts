import { type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { writeAudit } from "@/lib/auth/audit";
import { apiError, HttpError } from "@/lib/http";
import { createBusinessContextModel, listBusinessContextModels } from "@/lib/business-context/service";
import { modelCreateSchema, modelListQuerySchema } from "@/lib/business-context/validation";

export async function GET(request: NextRequest) { const meta = getRequestMeta(request); try { const session = await requireSession(request); const input = modelListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams)); return Response.json(await listBusinessContextModels(session.user, input)); } catch (error) { return apiError(error, meta.requestId); } }
export async function POST(request: NextRequest) { const meta = getRequestMeta(request); try { if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED"); const session = await requireSession(request); const input = modelCreateSchema.parse(await request.json()); const model = await createBusinessContextModel(input, session.user); await writeAudit({ actor: session.user, action: "CREATE_BUSINESS_CONTEXT_MODEL", category: "BUSINESS_CONTEXT", targetType: "BUSINESS_CONTEXT_MODEL", targetId: model.id, targetName: model.name, newValues: model, meta }); return Response.json({ model }, { status: 201 }); } catch (error) { return apiError(error, meta.requestId); } }
