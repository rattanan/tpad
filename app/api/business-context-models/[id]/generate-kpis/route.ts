import { type NextRequest } from "next/server";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { generateDraftKpisWithAi } from "@/lib/business-context/ai-assistance";
import { apiError, HttpError } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request);
    const id = (await params).id;
    const result = await generateDraftKpisWithAi(id, session.user);
    await writeAudit({ actor: session.user, action: "AI_GENERATE_DRAFT_KPIS", category: "KPI", targetType: "BUSINESS_CONTEXT_MODEL", targetId: id, newValues: result, meta });
    return Response.json(result, { status: 201 });
  } catch (error) { return apiError(error, meta.requestId); }
}
