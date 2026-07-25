import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getPublishedDashboard } from "@/lib/published-dashboards/service";
import ExecutiveDashboardViewer from "@/components/published-dashboards/executive-dashboard-viewer";

export default async function PublishedDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession(); if (!session) redirect("/login"); const { id } = await params;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) && session.user.role !== "VIEWER") redirect(`/workspace/dashboards/${id}/edit`);
  let data;
  try { data = await getPublishedDashboard(id, session.user); }
  catch (error) { if (error instanceof Error && (error.message.includes("not found") || error.message.includes("access"))) notFound(); throw error; }
  return <ExecutiveDashboardViewer initialJson={JSON.stringify(data)} />;
}
