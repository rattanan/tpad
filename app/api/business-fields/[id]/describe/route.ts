import { type NextRequest } from "next/server";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { generateBusinessFieldDescription } from "@/lib/business-context/ai-assistance";
import { apiError, HttpError } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request);
    const id = (await params).id;
    const field = await generateBusinessFieldDescription(id, session.user);
    await writeAudit({ actor: session.user, action: "AI_DESCRIBE_BUSINESS_FIELD", category: "BUSINESS_CONTEXT", targetType: "BUSINESS_FIELD", targetId: id, newValues: { description: field.description }, meta });
    return Response.json({ field });
  } catch (error) { return apiError(error, meta.requestId); }
}
