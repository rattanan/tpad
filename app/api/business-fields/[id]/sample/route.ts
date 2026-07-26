import { type NextRequest } from "next/server";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { getBusinessFieldSample } from "@/lib/business-context/service";
import { apiError, HttpError } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const { id } = await params;
    const session = await requireSession(request);
    const sample = await getBusinessFieldSample(id, session.user);
    await writeAudit({ actor: session.user, action: "BUSINESS_FIELD_SAMPLE_PREVIEWED", category: "BUSINESS_CONTEXT", targetType: "BUSINESS_FIELD", targetId: id, newValues: { returnedValues: sample.values.length, masked: sample.masked }, meta });
    return Response.json(sample);
  } catch (error) {
    return apiError(error, meta.requestId);
  }
}
