import { type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { apiError, HttpError } from "@/lib/http";
import { writeAudit } from "@/lib/auth/audit";
import { generateDraftDashboardWithAi } from "@/lib/dashboards/generator";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request);
    const id = (await params).id;
    const result = await generateDraftDashboardWithAi(id, session.user);
    await writeAudit({ actor: session.user, action: "DASHBOARD_DRAFT_GENERATED_WITH_AI", category: "DASHBOARD_AI", targetType: "DASHBOARD", targetId: id, newValues: { blockCount: result.blockCount, filterCount: result.filterCount, validationOutcome: result.validationOutcome }, meta });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, meta.requestId);
  }
}
