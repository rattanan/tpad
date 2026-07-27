import { redirect } from "next/navigation";
import KpiCatalogue from "@/components/kpis/kpi-catalogue";
import { getCurrentSession } from "@/lib/auth/session";
import { getBusinessContextWorkspace, listBusinessContextModels, listKpis } from "@/lib/business-context/service";

export default async function KpiCataloguePage({ searchParams }: { searchParams: Promise<{ modelId?: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const requestedModelId = (await searchParams).modelId;
  let models: Awaited<ReturnType<typeof listBusinessContextModels>>["items"] = [];
  let selectedModelId: string | undefined;
  let contextJson = "";

  if (session.user.role !== "VIEWER") {
    models = (await listBusinessContextModels(session.user, { page: 1, pageSize: 100 })).items;
    selectedModelId = models.find((item) => item.id === requestedModelId)?.id ?? models[0]?.id;
    if (selectedModelId) contextJson = JSON.stringify(await getBusinessContextWorkspace(selectedModelId, session.user));
  } else {
    selectedModelId = requestedModelId;
  }

  const kpis = await listKpis(session.user, { modelId: selectedModelId });
  return <KpiCatalogue initialKpisJson={JSON.stringify(kpis)} models={models.map((item) => ({ id: item.id, name: item.name, status: item.status }))} contextJson={contextJson} role={session.user.role} />;
}
