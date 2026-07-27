import { type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { writeAudit } from "@/lib/auth/audit";
import { generateDashboardWithAi } from "@/lib/dashboards/generator";
import { dashboardCreateSchema } from "@/lib/dashboards/validation";
import { apiError, HttpError } from "@/lib/http";
import { createAiProgressStream } from "@/lib/ai/progress-stream";

export async function POST(request: NextRequest) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request);
    const input = dashboardCreateSchema.parse(await request.json());
    if (request.headers.get("accept")?.includes("text/event-stream")) {
      return createAiProgressStream({ requestId: meta.requestId, run: (report) => generateDashboardWithAi(input, session.user, report), onComplete: (result) => writeAudit({ actor: session.user, action: "DASHBOARD_GENERATED_WITH_AI", category: "DASHBOARD_AI", targetType: "DASHBOARD", targetId: result.dashboardId, targetName: input.name, newValues: { blockCount: result.blockCount, filterCount: result.filterCount, planningMode: result.planningMode, fallbackReason: result.fallbackReason, validationOutcome: result.validationOutcome }, meta }) });
    }
    const result = await generateDashboardWithAi(input, session.user);
    await writeAudit({ actor: session.user, action: "DASHBOARD_GENERATED_WITH_AI", category: "DASHBOARD_AI", targetType: "DASHBOARD", targetId: result.dashboardId, targetName: input.name, newValues: { blockCount: result.blockCount, filterCount: result.filterCount, validationOutcome: result.validationOutcome }, meta });
    return Response.json(result, { status: 201 });
  } catch (error) { return apiError(error, meta.requestId); }
}
