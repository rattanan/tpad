import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { writeAudit } from "@/lib/auth/audit";
import { apiError, HttpError } from "@/lib/http";
import { createKpiVersion } from "@/lib/business-context/service";
import { workflowSchema } from "@/lib/business-context/validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request); const id = (await params).id; const input = workflowSchema.parse(await request.json().catch(() => ({})));
    const kpi = await createKpiVersion(id, session.user, input.changeSummary);
    await writeAudit({ actor: session.user, action: "CREATE_KPI_VERSION", category: "KPI", targetType: "KPI", targetId: id, newValues: { version: kpi.version, changeSummary: input.changeSummary }, meta });
    return Response.json({ kpi });
  } catch (error) { return apiError(error, meta.requestId); }
}
