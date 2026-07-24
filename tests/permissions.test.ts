import { describe, expect, it } from "vitest";
import { canCreateDashboard, canManageDataSources, canManageUsers, canViewAuditLogs, hasPermission } from "../lib/auth/permissions";

describe("role-based access control", () => {
  it("allows administrators to manage users and audit logs", () => { expect(canManageUsers("ADMIN")).toBe(true); expect(canViewAuditLogs("ADMIN")).toBe(true); });
  it("prevents viewers from using admin permissions", () => { expect(canManageUsers("VIEWER")).toBe(false); expect(canViewAuditLogs("VIEWER")).toBe(false); });
  it("prevents dashboard creators from managing data sources", () => expect(canManageDataSources("DASHBOARD_CREATOR")).toBe(false));
  it("prevents data source creators from managing users", () => expect(canManageUsers("DATA_SOURCE_CREATOR")).toBe(false));
  it("allows dashboard creators to create dashboards", () => expect(canCreateDashboard("DASHBOARD_CREATOR")).toBe(true));
  it("gives all roles dashboard view access", () => { for (const role of ["ADMIN", "DATA_SOURCE_CREATOR", "DASHBOARD_CREATOR", "VIEWER"] as const) expect(hasPermission(role, "VIEW_DASHBOARD")).toBe(true); });
});
