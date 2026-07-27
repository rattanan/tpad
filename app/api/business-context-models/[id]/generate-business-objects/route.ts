import { type NextRequest } from "next/server";
import { getRequestMeta, isSameOrigin } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { generateDraftBusinessObjectsWithAi } from "@/lib/business-context/ai-assistance";
import { apiError, HttpError } from "@/lib/http";
import { createAiProgressStream } from "@/lib/ai/progress-stream";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = getRequestMeta(request);
  try {
    if (!isSameOrigin(request)) throw new HttpError(403, "Invalid request origin", "CSRF_REJECTED");
    const session = await requireSession(request);
    const id = (await params).id;
    if (request.headers.get("accept")?.includes("text/event-stream")) {
      return createAiProgressStream({ requestId: meta.requestId, run: (report) => generateDraftBusinessObjectsWithAi(id, session.user, report), onComplete: (result) => writeAudit({ actor: session.user, action: "AI_GENERATE_DRAFT_BUSINESS_OBJECTS", category: "BUSINESS_CONTEXT", targetType: "BUSINESS_CONTEXT_MODEL", targetId: id, newValues: { createdCount: result.createdCount, skippedEmptyCount: result.skippedEmptyCount, skippedNonMeasureCount: result.skippedNonMeasureCount, generationMode: result.generationMode, objectIds: result.objects.map((item) => item.id) }, meta }) });
    }
    const result = await generateDraftBusinessObjectsWithAi(id, session.user);
    await writeAudit({ actor: session.user, action: "AI_GENERATE_DRAFT_BUSINESS_OBJECTS", category: "BUSINESS_CONTEXT", targetType: "BUSINESS_CONTEXT_MODEL", targetId: id, newValues: { createdCount: result.createdCount, skippedEmptyCount: result.skippedEmptyCount, skippedNonMeasureCount: result.skippedNonMeasureCount, objectIds: result.objects.map((item) => item.id) }, meta });
    return Response.json(result, { status: 201 });
  } catch (error) { return apiError(error, meta.requestId); }
}
