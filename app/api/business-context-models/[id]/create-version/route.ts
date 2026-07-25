import type { NextRequest } from "next/server"; import { modelActionHandler, type IdContext } from "@/lib/business-context/api-handlers";
export async function POST(request: NextRequest, context: IdContext) { return modelActionHandler(request, context, "CREATE_VERSION", "CREATE_BUSINESS_CONTEXT_VERSION"); }
