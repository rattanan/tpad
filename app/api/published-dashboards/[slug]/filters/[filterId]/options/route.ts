import { type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getRequestMeta } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { getPublishedFilterOptions } from "@/lib/published-dashboards/service";
import { filterOptionsQuerySchema } from "@/lib/published-dashboards/validation";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; filterId: string }> }) {
  const meta = getRequestMeta(request);
  try {
    const session = await requireSession(request); const { slug, filterId } = await params; const url = new URL(request.url);
    const input = filterOptionsQuerySchema.parse({ search: url.searchParams.get("search") ?? "", page: url.searchParams.get("page") ?? "1", pageSize: url.searchParams.get("pageSize") ?? "30", parentFilters: url.searchParams.get("parentFilters") ?? "[]" });
    return Response.json(await getPublishedFilterOptions(slug, filterId, input, session.user), { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) { return apiError(error, meta.requestId); }
}
