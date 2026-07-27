import type { NextRequest } from "next/server";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { autoApproveAndCertifyKpis } from "@/lib/business-context/kpi";
import { apiError, HttpError } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request);
    const id = (await params).id;
    const result = await autoApproveAndCertifyKpis(id, session.user);
    await writeAudit({
      actor: session.user,
      action: "AUTO_APPROVE_CERTIFY_KPIS",
      category: "KPI",
      targetType: "BUSINESS_CONTEXT_MODEL",
      targetId: id,
      description: `Certified ${result.certifiedCount} KPIs; skipped ${result.skippedCount}`,
      newValues: result,
      meta,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error, meta.requestId);
  }
}
