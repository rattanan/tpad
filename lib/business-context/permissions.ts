import type { Permission } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { requireDataSourceAccess } from "@/lib/data-sources/service";
import { HttpError } from "@/lib/http";

const managePermissions = new Set<Permission>([
  "BUSINESS_CONTEXT_CREATE", "BUSINESS_CONTEXT_UPDATE", "BUSINESS_CONTEXT_DELETE", "BUSINESS_CONTEXT_ANALYZE", "BUSINESS_CONTEXT_REVIEW", "BUSINESS_CONTEXT_APPROVE", "BUSINESS_CONTEXT_ROLLBACK",
  "BUSINESS_OBJECT_MANAGE", "BUSINESS_FIELD_MANAGE", "BUSINESS_RELATIONSHIP_MANAGE", "BUSINESS_RELATIONSHIP_VALIDATE",
  "KPI_CREATE", "KPI_UPDATE", "KPI_VALIDATE", "KPI_TEST", "KPI_REVIEW", "KPI_APPROVE", "KPI_CERTIFY", "BUSINESS_GLOSSARY_MANAGE",
]);

export async function requireBusinessContextPermission(user: AuthenticatedUser, dataSourceId: string, permission: Permission) {
  if (!hasPermission(user.role, permission)) throw new HttpError(403, "You do not have permission to perform this action", "FORBIDDEN");
  if (user.role === "VIEWER" && permission === "KPI_VIEW") return;
  if (permission === "BUSINESS_CONTEXT_PUBLISH") {
    await requireDataSourceAccess(user, dataSourceId, "PUBLISH_BUSINESS_CONTEXT");
    return;
  }
  if (managePermissions.has(permission)) await requireDataSourceAccess(user, dataSourceId, "MANAGE_BUSINESS_CONTEXT");
  else await requireDataSourceAccess(user, dataSourceId, "USE_BUSINESS_CONTEXT");
}

export function assertEditable(status: string) {
  if (status === "PUBLISHED" || status === "ARCHIVED") throw new HttpError(409, "Published or archived metadata is immutable. Create a new draft version to make changes.", "IMMUTABLE_VERSION");
}

export const maySeePhysicalMetadata = (user: AuthenticatedUser) => user.role === "ADMIN" || user.role === "DATA_SOURCE_CREATOR";
export const maySeeGeneratedSql = maySeePhysicalMetadata;
