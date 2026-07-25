import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dataSources } from "@/lib/db/schema";
import { apiError, HttpError } from "@/lib/http";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
import { publicDataSource, requireDataSourceAccess, updateDataSource } from "@/lib/data-sources/service";
import { dataSourceUpdateSchema } from "@/lib/data-sources/validation"; import { writeAudit } from "@/lib/auth/audit";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { const meta = getRequestMeta(request); try { const { id } = await context.params; const session = await requireSession(request); await requireDataSourceAccess(session.user, id, "VIEW_METADATA"); const row = (await db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1))[0]; if (!row) throw new HttpError(404, "Data source not found", "NOT_FOUND"); return NextResponse.json({ dataSource: publicDataSource(row, session.user.role) }); } catch (e) { return apiError(e, meta.requestId); } }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { const meta = getRequestMeta(request); try { if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED"); const { id } = await context.params; const session = await requireSession(request); const result = await updateDataSource(id, dataSourceUpdateSchema.parse(await request.json()), session.user); await writeAudit({ actor: session.user, action: "DATA_SOURCE_UPDATED", category: "DATA_SOURCE", targetType: "DATA_SOURCE", targetId: id, targetName: result.current.name, previousValues: publicDataSource(result.previous, session.user.role), newValues: publicDataSource(result.current, session.user.role), meta }); return NextResponse.json({ dataSource: publicDataSource(result.current, session.user.role) }); } catch (e) { return apiError(e, meta.requestId); } }
