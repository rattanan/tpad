import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { loginHistory } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { getRequestMeta } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
export async function GET(request: NextRequest) { const meta = getRequestMeta(request); try { const session = await requireSession(request); const items = await db.select().from(loginHistory).where(eq(loginHistory.userId, session.user.id)).orderBy(desc(loginHistory.createdAt)).limit(50); return Response.json({ items }); } catch (error) { return apiError(error, meta.requestId); } }
