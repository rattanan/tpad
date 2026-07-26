import { notFound, redirect } from "next/navigation";
import KpiDetail from "@/components/kpis/kpi-detail";
import DeleteAssetButton from "@/components/shared/delete-asset-button";
import { getCurrentSession } from "@/lib/auth/session";
import { getBusinessContextWorkspace, getKpi } from "@/lib/business-context/service";
import { hasPermission } from "@/lib/auth/permissions";

export default async function KpiDetailPage({ params }: { params: Promise<{ kpiId: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  let kpi;
  try { kpi = await getKpi((await params).kpiId, session.user); }
  catch (error) { if (error instanceof Error && error.message.includes("not found")) notFound(); throw error; }
  const workspace = await getBusinessContextWorkspace(kpi.modelId, session.user);
  const objects = new Map(workspace.objects.map((item) => [item.id, item.businessName]));
  const fields = workspace.fields.map((field) => ({ id: field.id, businessName: field.businessName, businessObjectName: objects.get(field.businessObjectId) ?? "Business object", businessType: field.businessType, fieldRole: field.fieldRole }));
  return <><KpiDetail kpiJson={JSON.stringify(kpi)} fieldsJson={JSON.stringify(fields)} role={session.user.role} />{hasPermission(session.user.role, "KPI_DELETE") && <DeleteAssetButton assetId={kpi.id} assetName={kpi.name} assetType="KPI" endpoint={`/api/kpis/${kpi.id}`} returnHref="/kpi-catalogue" />}</>;
}
