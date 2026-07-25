import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { dataSourceAccess, dataSourceConnectionTests, dataSources, users, type DataSourceAccessPermission, type Role } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import { encryptCredential } from "./credentials";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canManageDataSources, roleAllowsDataSourcePermission } from "@/lib/auth/permissions";

type Source = typeof dataSources.$inferSelect;
export function publicDataSource(row: Source, role: Role) {
  const { encryptedPassword, passwordIv, passwordAuthTag, passwordKeyVersion, ...safe } = row; void encryptedPassword; void passwordIv; void passwordAuthTag; void passwordKeyVersion;
  if (role === "DASHBOARD_CREATOR" || role === "VIEWER") { safe.username = ""; safe.connectionString = null; return safe; }
  return { ...safe, hasPassword: true, passwordMasked: "••••••••" };
}
export async function getDataSource(id: string) { return (await db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1))[0] ?? null; }
export async function canAccessDataSource(user: AuthenticatedUser, sourceId: string, permission: DataSourceAccessPermission) {
  if (!roleAllowsDataSourcePermission(user.role, permission)) return false;
  const source = await getDataSource(sourceId); if (!source) return false;
  if (source.status === "ARCHIVED") return permission === "VIEW_METADATA" && (user.role === "ADMIN" || source.ownerUserId === user.id);
  if (user.role === "ADMIN" || (user.role === "DATA_SOURCE_CREATOR" && source.ownerUserId === user.id && permission !== "PUBLISH_BUSINESS_CONTEXT")) return true;
  const grants = await db.select().from(dataSourceAccess).where(and(eq(dataSourceAccess.dataSourceId, sourceId), isNull(dataSourceAccess.revokedAt)));
  return grants.some((grant) => (grant.userId === user.id || grant.role === user.role) && grant.permission === permission);
}
export async function requireDataSourceAccess(user: AuthenticatedUser, sourceId: string, permission: DataSourceAccessPermission) { if (!(await canAccessDataSource(user, sourceId, permission))) throw new HttpError(403, "You do not have access to this data source", "FORBIDDEN"); }
export async function listDataSources(user: AuthenticatedUser, input: { q?: string; environment?: Source["environment"]; status?: Source["status"]; connectionStatus?: Source["connectionStatus"]; page: number; pageSize: number }) {
  if (user.role === "VIEWER") return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
  const filters = []; if (input.q) filters.push(or(like(dataSources.name, `%${input.q}%`), like(dataSources.host, `%${input.q}%`))!); if (input.environment) filters.push(eq(dataSources.environment, input.environment)); if (input.status) filters.push(eq(dataSources.status, input.status)); if (input.connectionStatus) filters.push(eq(dataSources.connectionStatus, input.connectionStatus));
  const rows = await db.select().from(dataSources).where(filters.length ? and(...filters) : undefined).orderBy(desc(dataSources.updatedAt));
  const visible = user.role === "ADMIN" ? rows : (await Promise.all(rows.map(async (row) => row.ownerUserId === user.id || await canAccessDataSource(user, row.id, "VIEW_METADATA") ? row : null))).filter((row): row is Source => Boolean(row));
  return { items: visible.slice((input.page - 1) * input.pageSize, input.page * input.pageSize).map((row) => publicDataSource(row, user.role)), total: visible.length, page: input.page, pageSize: input.pageSize };
}
export type DataSourceInput = { name: string; description?: string; environment: "DEVELOPMENT" | "TEST" | "UAT" | "PRODUCTION"; status: "DRAFT" | "ACTIVE" | "INACTIVE"; host: string; port: number; connectionMode: "SERVICE_NAME" | "SID" | "CONNECTION_STRING"; connectionString?: string; serviceName?: string; sid?: string; username: string; password: string; defaultSchema?: string; allowedSchemas: string[]; connectionTimeoutSeconds: number; queryTimeoutSeconds: number };
export async function createDataSource(input: DataSourceInput, user: AuthenticatedUser) {
  if (!canManageDataSources(user.role)) throw new HttpError(403, "You do not have permission to create data sources", "FORBIDDEN");
  const now = new Date(); const id = randomUUID(); const secret = encryptCredential(input.password);
  await db.insert(dataSources).values({ id, name: input.name, description: input.description, databaseType: "ORACLE", environment: input.environment, status: input.status, host: input.host, port: input.port, connectionMode: input.connectionMode, connectionString: input.connectionString, serviceName: input.serviceName, sid: input.sid, username: input.username, ...secret, defaultSchema: input.defaultSchema, allowedSchemas: JSON.stringify(input.allowedSchemas), connectionTimeoutSeconds: input.connectionTimeoutSeconds, queryTimeoutSeconds: input.queryTimeoutSeconds, ownerUserId: user.id, createdBy: user.id, updatedBy: user.id, createdAt: now, updatedAt: now });
  return (await getDataSource(id))!;
}
export async function updateDataSource(id: string, changes: Partial<DataSourceInput>, user: AuthenticatedUser) {
  await requireDataSourceAccess(user, id, "MANAGE_CONNECTION"); const previous = await getDataSource(id); if (!previous) throw new HttpError(404, "Data source not found", "NOT_FOUND");
  const candidate = { ...previous, ...changes }; if (candidate.connectionMode !== "CONNECTION_STRING" && !candidate.host) throw new HttpError(400, "Host is required", "VALIDATION_ERROR"); if (candidate.connectionMode === "SERVICE_NAME" && !candidate.serviceName) throw new HttpError(400, "Service name is required", "VALIDATION_ERROR"); if (candidate.connectionMode === "SID" && !candidate.sid) throw new HttpError(400, "SID is required", "VALIDATION_ERROR"); if (candidate.connectionMode === "CONNECTION_STRING" && !candidate.connectionString) throw new HttpError(400, "Connection string is required", "VALIDATION_ERROR"); if (candidate.connectionString && /(password|pwd)\s*=|\/[^@\s]+@/i.test(candidate.connectionString)) throw new HttpError(400, "Connection string must not contain credentials", "VALIDATION_ERROR");
  const { password, allowedSchemas, ...rest } = changes; const secret = password ? encryptCredential(password) : {}; await db.update(dataSources).set({ ...rest, ...secret, allowedSchemas: allowedSchemas ? JSON.stringify(allowedSchemas) : undefined, updatedBy: user.id, updatedAt: new Date() }).where(eq(dataSources.id, id)); return { previous, current: (await getDataSource(id))! };
}
export async function archiveDataSource(id: string, user: AuthenticatedUser) { await requireDataSourceAccess(user, id, "MANAGE_CONNECTION"); const source = await getDataSource(id); if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND"); const now = new Date(); await db.update(dataSources).set({ status: "ARCHIVED", archivedAt: now, updatedAt: now, updatedBy: user.id }).where(eq(dataSources.id, id)); return source; }
export async function recordConnectionTest(sourceId: string, user: AuthenticatedUser, meta: { requestId: string; ipAddress: string }, result: { status: "CONNECTED" | "FAILED" | "TIMEOUT"; responseTimeMs: number; databaseVersion?: string | null; currentUser?: string | null; currentSchema?: string | null; code?: string; category?: string; message?: string }) {
  const now = new Date(); const source = await getDataSource(sourceId); await db.insert(dataSourceConnectionTests).values({ id: randomUUID(), dataSourceId: sourceId, status: result.status, responseTimeMs: result.responseTimeMs, databaseVersion: result.databaseVersion, currentUser: result.currentUser, currentSchema: result.currentSchema, errorCode: result.code, errorCategory: result.category, errorMessage: result.message, testedBy: user.id, ipAddress: meta.ipAddress, requestId: meta.requestId, testedAt: now });
  await db.update(dataSources).set({ connectionStatus: result.status, databaseVersion: result.databaseVersion || undefined, lastConnectionTestAt: now, lastSuccessfulConnectionAt: result.status === "CONNECTED" ? now : undefined, status: result.status === "CONNECTED" && source?.status === "CONNECTION_ERROR" ? "ACTIVE" : result.status === "CONNECTED" ? undefined : "CONNECTION_ERROR", updatedAt: now, updatedBy: user.id }).where(eq(dataSources.id, sourceId));
}
export async function listAccess() { return db.select({ id: dataSourceAccess.id, dataSourceId: dataSourceAccess.dataSourceId, dataSourceName: dataSources.name, userId: dataSourceAccess.userId, userName: users.fullName, role: dataSourceAccess.role, permission: dataSourceAccess.permission, grantedAt: dataSourceAccess.grantedAt }).from(dataSourceAccess).innerJoin(dataSources, eq(dataSources.id, dataSourceAccess.dataSourceId)).leftJoin(users, eq(users.id, dataSourceAccess.userId)).where(isNull(dataSourceAccess.revokedAt)).orderBy(desc(dataSourceAccess.grantedAt)); }
export async function grantDataSourceAccess(input: { dataSourceId: string; userId?: string; role?: Role; permission: DataSourceAccessPermission }, grantedBy: string) { let targetRole = input.role; if (input.userId) targetRole = (await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1))[0]?.role; if (!targetRole) throw new HttpError(404, "Access subject not found", "NOT_FOUND"); if (!roleAllowsDataSourcePermission(targetRole, input.permission)) throw new HttpError(400, "This permission is not allowed for the selected role", "INVALID_PERMISSION"); await db.insert(dataSourceAccess).values({ id: randomUUID(), ...input, grantedBy, grantedAt: new Date() }); }
export async function revokeDataSourceAccess(id: string) { await db.update(dataSourceAccess).set({ revokedAt: new Date() }).where(eq(dataSourceAccess.id, id)); }
export async function connectionHistory(id: string) { return db.select().from(dataSourceConnectionTests).where(eq(dataSourceConnectionTests.dataSourceId, id)).orderBy(desc(dataSourceConnectionTests.testedAt)).limit(50); }
