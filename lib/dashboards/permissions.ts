import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { requireDataSourceAccess } from "@/lib/data-sources/service";
import { HttpError } from "@/lib/http";

export function requireDashboardRole(user: AuthenticatedUser, permission: Permission) { if (!hasPermission(user.role, permission)) throw new HttpError(403, "You do not have permission to perform this dashboard action", "FORBIDDEN"); }
export async function requireDashboardAccess(user: AuthenticatedUser, dashboardId: string, mode: "VIEW" | "EDIT" | "REVIEW" | "PUBLISH") {
  const dashboard = (await db.select().from(dashboards).where(and(eq(dashboards.id, dashboardId), isNull(dashboards.archivedAt))).limit(1))[0];
  if (!dashboard) throw new HttpError(404, "Dashboard not found", "NOT_FOUND");
  if (mode === "VIEW") {
    requireDashboardRole(user, "VIEW_DASHBOARD");
    if (user.role !== "ADMIN" && dashboard.visibility === "PRIVATE" && dashboard.ownerUserId !== user.id) throw new HttpError(403, "Dashboard access denied", "FORBIDDEN");
  } else if (mode === "EDIT") {
    requireDashboardRole(user, "EDIT_DASHBOARD");
    if (user.role !== "ADMIN" && dashboard.ownerUserId !== user.id) throw new HttpError(403, "Only the owner or an administrator can edit this dashboard", "FORBIDDEN");
  } else if (mode === "REVIEW") requireDashboardRole(user, "REVIEW_DASHBOARD");
  else requireDashboardRole(user, "PUBLISH_DASHBOARD");
  return dashboard;
}
export async function requireDashboardDataSource(user: AuthenticatedUser, dataSourceId: string) { await requireDataSourceAccess(user, dataSourceId, "USE_FOR_DASHBOARD"); }
export const mayViewDashboardSql = (user: AuthenticatedUser) => user.role === "ADMIN" || user.role === "DATA_SOURCE_CREATOR";
