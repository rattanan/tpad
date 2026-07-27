import { type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { apiError, HttpError } from "@/lib/http";
import { writeAudit } from "@/lib/auth/audit";
import { globalFilterSchema } from "@/lib/dashboards/validation";
import { updateGlobalFilter } from "@/lib/dashboards/service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; filterId: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request); const { id, filterId } = await params;
    const input = globalFilterSchema.parse(await request.json());
    const result = await updateGlobalFilter(id, filterId, input, session.user);
    await writeAudit({ actor: session.user, action: "DASHBOARD_FILTER_UPDATED", category: "DASHBOARD", targetType: "DASHBOARD_FILTER", targetId: filterId, newValues: { dashboardId: id, fieldId: input.businessFieldId, controlType: input.configuration?.controlType }, meta });
    return Response.json(result);
  } catch (error) { return apiError(error, meta.requestId); }
}
