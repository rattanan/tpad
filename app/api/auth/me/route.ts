import type { NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { getRequestMeta } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
export async function GET(request: NextRequest) { const meta = getRequestMeta(request); try { const session = await requireSession(request); return Response.json({ user: session.user }); } catch (error) { return apiError(error, meta.requestId); } }
