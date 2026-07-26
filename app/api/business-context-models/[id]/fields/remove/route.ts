import { type NextRequest } from "next/server";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { archiveBusinessFields } from "@/lib/business-context/service";
import { fieldRemovalSchema } from "@/lib/business-context/validation";
import { apiError, HttpError } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request);
    const id = (await params).id;
    const result = await archiveBusinessFields(id, fieldRemovalSchema.parse(await request.json()).fieldIds, session.user);
    await writeAudit({ actor: session.user, action: "REMOVE_BUSINESS_FIELDS", category: "BUSINESS_CONTEXT", targetType: "BUSINESS_CONTEXT_MODEL", targetId: id, newValues: result, meta });
    return Response.json(result);
  } catch (error) { return apiError(error, meta.requestId); }
}
