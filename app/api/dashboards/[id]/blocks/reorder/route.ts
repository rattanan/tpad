import { type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { writeAudit } from "@/lib/auth/audit";
import { apiError, HttpError } from "@/lib/http";
import { reorderDashboardBlocks } from "@/lib/dashboards/service";
import { blockReorderSchema } from "@/lib/dashboards/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request); const { id } = await params; const input = blockReorderSchema.parse(await request.json());
    const result = await reorderDashboardBlocks(id, input.sourceBlockId, input.targetBlockId, input.expectedRevision, session.user);
    await writeAudit({ actor: session.user, action: "DASHBOARD_BLOCKS_REORDERED", category: "DASHBOARD", targetType: "DASHBOARD", targetId: id, newValues: { sourceBlockId: input.sourceBlockId, targetBlockId: input.targetBlockId, revision: result.revision }, meta });
    return Response.json(result);
  } catch (error) { return apiError(error, meta.requestId); }
}
