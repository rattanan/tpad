import { and, count, desc, eq, like, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { getRequestMeta } from "@/lib/auth/request";
import { requirePermission } from "@/lib/auth/session";
export async function GET(request: NextRequest) { const meta = getRequestMeta(request); try { await requirePermission(request, "VIEW_AUDIT_LOGS"); const q = request.nextUrl.searchParams; const page = Math.max(1, Number(q.get("page")) || 1); const pageSize = Math.min(100, Math.max(1, Number(q.get("pageSize")) || 20)); const filters = []; if (q.get("action")) filters.push(eq(auditLogs.action, q.get("action")!)); if (q.get("targetType")) filters.push(eq(auditLogs.targetType, q.get("targetType")!)); if (q.get("q")) filters.push(or(like(auditLogs.actorName, `%${q.get("q")}%`), like(auditLogs.targetName, `%${q.get("q")}%`), like(auditLogs.description, `%${q.get("q")}%`))!); const where = filters.length ? and(...filters) : undefined; const [items, totals] = await Promise.all([db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize), db.select({ count: count() }).from(auditLogs).where(where)]); return Response.json({ items, total: totals[0]?.count ?? 0, page, pageSize }); } catch (error) { return apiError(error, meta.requestId); } }
