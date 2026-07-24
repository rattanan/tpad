import type { Role } from "@/lib/db/schema";

export type Permission =
  | "MANAGE_USERS"
  | "VIEW_LOGIN_HISTORY"
  | "VIEW_AUDIT_LOGS"
  | "MANAGE_DATA_SOURCES"
  | "CREATE_DASHBOARD"
  | "VIEW_DASHBOARD"
  | "EXPORT_DATA"
  | "USE_COPILOT";

export const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(["MANAGE_USERS", "VIEW_LOGIN_HISTORY", "VIEW_AUDIT_LOGS", "MANAGE_DATA_SOURCES", "CREATE_DASHBOARD", "VIEW_DASHBOARD", "EXPORT_DATA", "USE_COPILOT"]),
  DATA_SOURCE_CREATOR: new Set(["MANAGE_DATA_SOURCES", "VIEW_DASHBOARD", "USE_COPILOT"]),
  DASHBOARD_CREATOR: new Set(["CREATE_DASHBOARD", "VIEW_DASHBOARD", "USE_COPILOT"]),
  VIEWER: new Set(["VIEW_DASHBOARD", "USE_COPILOT"]),
};

export function hasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].has(permission);
}
export const canManageUsers = (role: Role) => hasPermission(role, "MANAGE_USERS");
export const canManageDataSources = (role: Role) => hasPermission(role, "MANAGE_DATA_SOURCES");
export const canCreateDashboard = (role: Role) => hasPermission(role, "CREATE_DASHBOARD");
export const canViewAuditLogs = (role: Role) => hasPermission(role, "VIEW_AUDIT_LOGS");
export const canUseCopilot = (role: Role) => hasPermission(role, "USE_COPILOT");
