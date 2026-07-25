import type { NextRequest } from "next/server"; import { kpiActionHandler, type IdContext } from "@/lib/business-context/api-handlers";
export async function POST(request: NextRequest, context: IdContext) { return kpiActionHandler(request, context, "SUBMIT", "SUBMIT_KPI_REVIEW"); }
