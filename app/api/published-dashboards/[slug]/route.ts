import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";import { getRequestMeta } from "@/lib/auth/request";import { apiError } from "@/lib/http";import { getPublishedDashboard } from "@/lib/published-dashboards/service";
export async function GET(request:NextRequest,{params}:{params:Promise<{slug:string}>}){const meta=getRequestMeta(request);try{const session=await requireSession(request);return Response.json(await getPublishedDashboard((await params).slug,session.user));}catch(error){return apiError(error,meta.requestId)}}
