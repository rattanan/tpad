import type { DataSourceAccessPermission, Role } from "@/lib/db/schema";

export type Permission =
  | "MANAGE_USERS"
  | "VIEW_LOGIN_HISTORY"
  | "VIEW_AUDIT_LOGS"
  | "MANAGE_DATA_SOURCES"
  | "CREATE_DASHBOARD"
  | "VIEW_DASHBOARD"
  | "EDIT_DASHBOARD"
  | "DELETE_DASHBOARD"
  | "REVIEW_DASHBOARD"
  | "PUBLISH_DASHBOARD"
  | "MANAGE_DASHBOARD_ACCESS"
  | "EXPORT_DATA"
  | "USE_COPILOT"
  | "VIEW_PUBLISHED_DASHBOARD"
  | "VIEW_UNDERLYING_DATA"
  | "EXPORT_PUBLISHED_DASHBOARD"
  | "USE_DASHBOARD_COPILOT"
  | "GENERATE_EXECUTIVE_SUMMARY"
  | "BUSINESS_CONTEXT_VIEW" | "BUSINESS_CONTEXT_CREATE" | "BUSINESS_CONTEXT_UPDATE" | "BUSINESS_CONTEXT_DELETE"
  | "BUSINESS_CONTEXT_ANALYZE" | "BUSINESS_CONTEXT_REVIEW" | "BUSINESS_CONTEXT_APPROVE" | "BUSINESS_CONTEXT_PUBLISH" | "BUSINESS_CONTEXT_ROLLBACK"
  | "BUSINESS_OBJECT_VIEW" | "BUSINESS_OBJECT_MANAGE" | "BUSINESS_FIELD_VIEW" | "BUSINESS_FIELD_MANAGE"
  | "BUSINESS_RELATIONSHIP_VIEW" | "BUSINESS_RELATIONSHIP_MANAGE" | "BUSINESS_RELATIONSHIP_VALIDATE"
  | "KPI_VIEW" | "KPI_CREATE" | "KPI_UPDATE" | "KPI_DELETE" | "KPI_VALIDATE" | "KPI_TEST" | "KPI_REVIEW" | "KPI_APPROVE" | "KPI_CERTIFY"
  | "BUSINESS_GLOSSARY_VIEW" | "BUSINESS_GLOSSARY_MANAGE";

const contextView: Permission[] = ["BUSINESS_CONTEXT_VIEW", "BUSINESS_OBJECT_VIEW", "BUSINESS_FIELD_VIEW", "BUSINESS_RELATIONSHIP_VIEW", "KPI_VIEW", "BUSINESS_GLOSSARY_VIEW"];
const contextManage: Permission[] = ["BUSINESS_CONTEXT_CREATE", "BUSINESS_CONTEXT_UPDATE", "BUSINESS_CONTEXT_DELETE", "BUSINESS_CONTEXT_ANALYZE", "BUSINESS_CONTEXT_REVIEW", "BUSINESS_OBJECT_MANAGE", "BUSINESS_FIELD_MANAGE", "BUSINESS_RELATIONSHIP_MANAGE", "BUSINESS_RELATIONSHIP_VALIDATE", "KPI_CREATE", "KPI_UPDATE", "KPI_DELETE", "KPI_VALIDATE", "KPI_TEST", "KPI_REVIEW", "BUSINESS_GLOSSARY_MANAGE"];
const contextGovern: Permission[] = ["BUSINESS_CONTEXT_APPROVE", "BUSINESS_CONTEXT_PUBLISH", "BUSINESS_CONTEXT_ROLLBACK", "KPI_APPROVE", "KPI_CERTIFY"];

export const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(["MANAGE_USERS", "VIEW_LOGIN_HISTORY", "VIEW_AUDIT_LOGS", "MANAGE_DATA_SOURCES", "CREATE_DASHBOARD", "VIEW_DASHBOARD", "EDIT_DASHBOARD", "DELETE_DASHBOARD", "REVIEW_DASHBOARD", "PUBLISH_DASHBOARD", "MANAGE_DASHBOARD_ACCESS", "EXPORT_DATA", "USE_COPILOT", "VIEW_PUBLISHED_DASHBOARD", "VIEW_UNDERLYING_DATA", "EXPORT_PUBLISHED_DASHBOARD", "USE_DASHBOARD_COPILOT", "GENERATE_EXECUTIVE_SUMMARY", ...contextView, ...contextManage, ...contextGovern]),
  DATA_SOURCE_CREATOR: new Set(["MANAGE_DATA_SOURCES", "VIEW_DASHBOARD", "USE_COPILOT", "VIEW_PUBLISHED_DASHBOARD", "USE_DASHBOARD_COPILOT", "GENERATE_EXECUTIVE_SUMMARY", ...contextView, ...contextManage]),
  DASHBOARD_CREATOR: new Set(["CREATE_DASHBOARD", "VIEW_DASHBOARD", "EDIT_DASHBOARD", "DELETE_DASHBOARD", "USE_COPILOT", "VIEW_PUBLISHED_DASHBOARD", "USE_DASHBOARD_COPILOT", "GENERATE_EXECUTIVE_SUMMARY", "BUSINESS_CONTEXT_VIEW", "BUSINESS_OBJECT_VIEW", "BUSINESS_FIELD_VIEW", "BUSINESS_RELATIONSHIP_VIEW", "KPI_VIEW", "BUSINESS_GLOSSARY_VIEW"]),
  VIEWER: new Set(["VIEW_DASHBOARD", "USE_COPILOT", "VIEW_PUBLISHED_DASHBOARD", "USE_DASHBOARD_COPILOT", "GENERATE_EXECUTIVE_SUMMARY", "KPI_VIEW"]),
};

export function hasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].has(permission);
}
export const canManageUsers = (role: Role) => hasPermission(role, "MANAGE_USERS");
export const canManageDataSources = (role: Role) => hasPermission(role, "MANAGE_DATA_SOURCES");
export const canCreateDashboard = (role: Role) => hasPermission(role, "CREATE_DASHBOARD");
export const canViewAuditLogs = (role: Role) => hasPermission(role, "VIEW_AUDIT_LOGS");
export const canUseCopilot = (role: Role) => hasPermission(role, "USE_COPILOT");
export const canCreateDataSource = (role: Role) => canManageDataSources(role);
export const canEditDataSource = (role: Role) => canManageDataSources(role);
export const canTestDataSource = (role: Role) => canManageDataSources(role);
export const canSyncMetadata = (role: Role) => canManageDataSources(role);
export const canViewDataSourceMetadata = (role: Role) => role !== "VIEWER";
export const canPreviewData = (role: Role) => role === "ADMIN" || role === "DATA_SOURCE_CREATOR";
export const canAssignDataSourceAccess = (role: Role) => role === "ADMIN";
export const canViewBusinessContext = (role: Role) => hasPermission(role, "BUSINESS_CONTEXT_VIEW");
export const canManageBusinessContext = (role: Role) => hasPermission(role, "BUSINESS_CONTEXT_UPDATE");
const dataSourceRoleCeiling: Record<Role, ReadonlySet<DataSourceAccessPermission>> = { ADMIN: new Set(["VIEW_METADATA", "PREVIEW_DATA", "USE_FOR_DASHBOARD", "EDIT_METADATA", "MANAGE_CONNECTION", "SYNC_METADATA", "MANAGE_BUSINESS_CONTEXT", "PUBLISH_BUSINESS_CONTEXT", "USE_BUSINESS_CONTEXT"]), DATA_SOURCE_CREATOR: new Set(["VIEW_METADATA", "PREVIEW_DATA", "EDIT_METADATA", "MANAGE_CONNECTION", "SYNC_METADATA", "MANAGE_BUSINESS_CONTEXT", "PUBLISH_BUSINESS_CONTEXT", "USE_BUSINESS_CONTEXT"]), DASHBOARD_CREATOR: new Set(["VIEW_METADATA", "PREVIEW_DATA", "USE_FOR_DASHBOARD", "USE_BUSINESS_CONTEXT"]), VIEWER: new Set() };
export const roleAllowsDataSourcePermission = (role: Role, permission: DataSourceAccessPermission) => dataSourceRoleCeiling[role].has(permission);
