import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { listPublishedDashboards } from "@/lib/published-dashboards/service";
import DashboardPortal from "@/components/published-dashboards/dashboard-portal";

export default async function PublishedDashboardsPage() {
  const session = await getCurrentSession(); if (!session) redirect("/login");
  const dashboards = await listPublishedDashboards(session.user);
  return <DashboardPortal initialJson={JSON.stringify(dashboards)} />;
}
