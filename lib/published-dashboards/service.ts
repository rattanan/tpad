import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dashboardBlocks, dashboardFavorites, dashboardGlobalFilters, dashboardPublications, dashboardRecentViews, dashboards, dashboardVersions, dashboardViewEvents } from "@/lib/db/schema";
import { getDataSource } from "@/lib/data-sources/service";
import { withOracleConnection } from "@/lib/data-sources/oracle";
import { generateBlockQuery } from "@/lib/dashboards/query";
import type { z } from "zod";
import { HttpError } from "@/lib/http";
import { canAccessPublication } from "./access";
import { runtimeFiltersSchema } from "./validation";

export type RuntimeFilterInput = z.infer<typeof runtimeFiltersSchema>;
const parseJson = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

export async function getPublishedDashboardRecord(slug: string, user: AuthenticatedUser) {
  if (!hasPermission(user.role, "VIEW_PUBLISHED_DASHBOARD")) throw new HttpError(403, "Published dashboard access is not permitted", "FORBIDDEN");
  const row = (await db.select({ dashboard: dashboards, publication: dashboardPublications, version: dashboardVersions })
    .from(dashboards)
    .innerJoin(dashboardPublications, and(eq(dashboardPublications.dashboardId, dashboards.id), isNull(dashboardPublications.unpublishedAt)))
    .innerJoin(dashboardVersions, eq(dashboardVersions.id, dashboardPublications.dashboardVersionId))
    .where(and(eq(dashboards.slug, slug), eq(dashboards.status, "PUBLISHED"), isNull(dashboards.archivedAt)))
    .orderBy(desc(dashboardPublications.publishedAt)).limit(1))[0];
  if (!row) throw new HttpError(404, "Published dashboard not found", "NOT_FOUND");
  if (!canAccessPublication(row.publication, user)) throw new HttpError(403, "You do not have access to this published dashboard", "FORBIDDEN");
  return row;
}

export async function listPublishedDashboards(user: AuthenticatedUser) {
  if (!hasPermission(user.role, "VIEW_PUBLISHED_DASHBOARD")) throw new HttpError(403, "Published dashboard access is not permitted", "FORBIDDEN");
  const [rows, favorites, recent] = await Promise.all([
    db.select({ dashboard: dashboards, publication: dashboardPublications })
      .from(dashboards).innerJoin(dashboardPublications, and(eq(dashboardPublications.dashboardId, dashboards.id), isNull(dashboardPublications.unpublishedAt)))
      .where(and(eq(dashboards.status, "PUBLISHED"), isNull(dashboards.archivedAt))).orderBy(desc(dashboardPublications.publishedAt)),
    db.select().from(dashboardFavorites).where(eq(dashboardFavorites.userId, user.id)),
    db.select().from(dashboardRecentViews).where(eq(dashboardRecentViews.userId, user.id)).orderBy(desc(dashboardRecentViews.lastViewedAt)),
  ]);
  const favoriteIds = new Set(favorites.map((item) => item.dashboardId));
  const recentMap = new Map(recent.map((item) => [item.dashboardId, item]));
  const seen = new Set<string>();
  return rows.filter(({ dashboard, publication }) => !seen.has(dashboard.id) && canAccessPublication(publication, user) && (seen.add(dashboard.id), true)).map(({ dashboard, publication }) => ({
    id: dashboard.id, slug: dashboard.slug!, name: dashboard.name, description: dashboard.description, category: dashboard.category,
    thumbnailUrl: dashboard.thumbnailUrl, featured: dashboard.isFeatured, viewCount: dashboard.viewCount, favorite: favoriteIds.has(dashboard.id),
    recentAt: recentMap.get(dashboard.id)?.lastViewedAt ?? null, publishedAt: publication.publishedAt,
    capabilities: { export: publication.exportAllowed && hasPermission(user.role, "EXPORT_PUBLISHED_DASHBOARD"), ai: publication.aiCopilotAllowed && hasPermission(user.role, "USE_DASHBOARD_COPILOT") },
  }));
}

export async function getPublishedDashboard(slug: string, user: AuthenticatedUser) {
  const row = await getPublishedDashboardRecord(slug, user);
  const [blocks, filters, favorite] = await Promise.all([
    db.select().from(dashboardBlocks).where(and(eq(dashboardBlocks.dashboardVersionId, row.version.id), eq(dashboardBlocks.isHidden, false))).orderBy(asc(dashboardBlocks.sortOrder)),
    db.select().from(dashboardGlobalFilters).where(and(eq(dashboardGlobalFilters.dashboardVersionId, row.version.id), eq(dashboardGlobalFilters.isVisible, true))),
    db.select().from(dashboardFavorites).where(and(eq(dashboardFavorites.userId, user.id), eq(dashboardFavorites.dashboardId, row.dashboard.id))).limit(1),
  ]);
  return {
    dashboard: { id: row.dashboard.id, slug: row.dashboard.slug!, name: row.dashboard.name, description: row.dashboard.description, category: row.dashboard.category, thumbnailUrl: row.dashboard.thumbnailUrl, publishedAt: row.publication.publishedAt, lastDataRefreshAt: row.dashboard.lastDataRefreshAt, favorite: Boolean(favorite[0]) },
    blocks: blocks.map((block) => ({ id: block.id, title: block.title, description: block.description, businessQuestion: block.businessQuestion, decisionSupported: block.decisionSupported, blockType: block.blockType, visualizationType: block.visualizationType, position: parseJson(block.positionJson, { x: 0, y: 0, w: 6, h: 4 }), preview: parseJson<Record<string, unknown> | null>(block.previewJson, null) })),
    filters: filters.map((filter) => ({ id: filter.id, name: filter.name, filterType: filter.filterType, defaultValue: parseJson(filter.defaultValueJson, null), allowedValues: parseJson<unknown[]>(filter.allowedValuesJson, []), required: filter.isRequired, runtimeEditable: filter.runtimeEditable })),
    capabilities: { export: row.publication.exportAllowed && hasPermission(user.role, "EXPORT_PUBLISHED_DASHBOARD"), underlyingData: row.publication.underlyingDataAllowed && hasPermission(user.role, "VIEW_UNDERLYING_DATA"), drillDown: row.publication.drillDownAllowed, ai: row.publication.aiCopilotAllowed && hasPermission(user.role, "USE_DASHBOARD_COPILOT"), executiveSummary: row.publication.aiCopilotAllowed && hasPermission(user.role, "GENERATE_EXECUTIVE_SUMMARY") },
    suggestedQuestions: suggestedQuestions(row.dashboard.category),
  };
}

function suggestedQuestions(category: string) {
  const domain = category.toLowerCase();
  if (domain.includes("finance")) return ["What changed most versus the previous period?", "Which financial metric needs executive attention?", "Summarize the main variance and likely drivers."];
  if (domain.includes("inventory")) return ["Which inventory trend needs attention?", "Where is stock risk concentrated?", "Summarize current inventory performance."];
  if (domain.includes("maintenance")) return ["Which maintenance KPI is off target?", "Where are the largest operational exceptions?", "Summarize maintenance risk for leadership."];
  return ["What changed most in this dashboard?", "Which KPI needs executive attention?", "Summarize the most important findings."];
}

export async function setDashboardFavorite(slug: string, favorite: boolean, user: AuthenticatedUser) {
  const { dashboard } = await getPublishedDashboardRecord(slug, user); const now = new Date();
  if (favorite) await db.insert(dashboardFavorites).values({ userId: user.id, dashboardId: dashboard.id, createdAt: now }).onDuplicateKeyUpdate({ set: { createdAt: now } });
  else await db.delete(dashboardFavorites).where(and(eq(dashboardFavorites.userId, user.id), eq(dashboardFavorites.dashboardId, dashboard.id)));
  await recordViewerEvent(dashboard.id, user.id, favorite ? "FAVORITE" : "UNFAVORITE");
}

export async function recordDashboardView(slug: string, user: AuthenticatedUser) {
  const { dashboard } = await getPublishedDashboardRecord(slug, user); const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(dashboardRecentViews).values({ userId: user.id, dashboardId: dashboard.id, lastViewedAt: now, viewCount: 1 }).onDuplicateKeyUpdate({ set: { lastViewedAt: now, viewCount: sql`${dashboardRecentViews.viewCount} + 1` } });
    await tx.update(dashboards).set({ viewCount: sql`${dashboards.viewCount} + 1` }).where(eq(dashboards.id, dashboard.id));
    await tx.insert(dashboardViewEvents).values({ id: randomUUID(), userId: user.id, dashboardId: dashboard.id, eventType: "VIEW", createdAt: now });
  });
}

export async function recordViewerEvent(dashboardId: string, userId: string, eventType: typeof dashboardViewEvents.$inferInsert.eventType, widgetId?: string, parameters?: unknown) {
  await db.insert(dashboardViewEvents).values({ id: randomUUID(), userId, dashboardId, eventType, widgetId, parametersJson: parameters === undefined ? undefined : JSON.stringify(parameters), createdAt: new Date() });
}

function runtimeToQueryFilters(filters: typeof dashboardGlobalFilters.$inferSelect[], input: RuntimeFilterInput, blockId: string) {
  const byId = new Map(filters.map((filter) => [filter.id, filter]));
  return input.flatMap(({ filterId, values }) => {
    const filter = byId.get(filterId);
    if (!filter || !filter.isVisible || !filter.runtimeEditable || filter.securityEnforced) throw new HttpError(400, "Runtime filter is not available", "FILTER_NOT_ALLOWED");
    const targets = parseJson<string[]>(filter.appliesToBlockIdsJson, []); if (targets.length && !targets.includes(blockId)) return [];
    const allowed = parseJson<unknown[]>(filter.allowedValuesJson, []); if (allowed.length && values.some((value) => !allowed.some((item) => String(item) === String(value)))) throw new HttpError(400, "Filter value is outside the published allowlist", "FILTER_VALUE_NOT_ALLOWED");
    if (filter.isRequired && !values.length) throw new HttpError(400, `${filter.name} is required`, "FILTER_REQUIRED");
    if (!values.length) return [];
    const operator = filter.filterType === "DATE_RANGE" || filter.filterType === "NUMERIC_RANGE" ? "BETWEEN" as const : filter.filterType === "MULTI_SELECT" ? "IN" as const : "EQ" as const;
    return [{ businessFieldId: filter.businessFieldId, operator, values }];
  });
}

let activeViewerQueries = 0;
export async function executePublishedWidget(slug: string, blockId: string, input: RuntimeFilterInput, user: AuthenticatedUser) {
  const { dashboard, publication, version } = await getPublishedDashboardRecord(slug, user);
  const [block, filters] = await Promise.all([
    db.select().from(dashboardBlocks).where(and(eq(dashboardBlocks.id, blockId), eq(dashboardBlocks.dashboardVersionId, version.id), eq(dashboardBlocks.isHidden, false))).limit(1),
    db.select().from(dashboardGlobalFilters).where(eq(dashboardGlobalFilters.dashboardVersionId, version.id)),
  ]);
  if (!block[0]) throw new HttpError(404, "Published widget not found", "NOT_FOUND");
  if (block[0].blockType === "TEXT_INSIGHT") return { rows: [], executedAt: publication.publishedAt.toISOString(), source: "PUBLISHED_CONTENT" };
  if (activeViewerQueries >= 6) throw new HttpError(429, "Dashboard query capacity is busy. Retry shortly.", "QUERY_LIMIT");
  const validated = runtimeFiltersSchema.parse(input); const queryFilters = runtimeToQueryFilters(filters, validated, blockId);
  const generated = await generateBlockQuery(block[0], version, 100, queryFilters); const source = await getDataSource(version.dataSourceId);
  if (!source) throw new HttpError(404, "Dashboard data source is unavailable", "NOT_FOUND");
  activeViewerQueries += 1; const started = Date.now();
  try {
    const rows = await withOracleConnection(source, async (connection, outFormat) => ((await connection.execute(generated.sql, generated.binds, { outFormat, maxRows: 100 })).rows ?? []) as Array<Record<string, unknown>>);
    const executedAt = new Date(); await db.update(dashboards).set({ lastDataRefreshAt: executedAt }).where(eq(dashboards.id, dashboard.id));
    return { rows: rows.slice(0, 100), rowCount: rows.length, durationMs: Date.now() - started, executedAt: executedAt.toISOString(), source: "ORACLE_READ_ONLY" };
  } finally { activeViewerQueries -= 1; }
}
