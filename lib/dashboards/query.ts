import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessFields, dashboardBlocks, dashboardVersions, kpiDefinitions, kpiDefinitionVersions } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { compileKpi } from "@/lib/business-context/kpi";
import { getDataSource } from "@/lib/data-sources/service";
import { withOracleConnection } from "@/lib/data-sources/oracle";
import { HttpError } from "@/lib/http";
import { requireDashboardDataSource } from "./permissions";
import { assertSafeDashboardSql } from "./rules";
import { filterSchema, queryPlanSchema } from "./validation";
import { datasetShapes, validateDatasetRows, type DatasetShape } from "./planning";
import type { z } from "zod";

type Filter = z.infer<typeof filterSchema>;
type Bind = string | number | boolean | Date | null;
const identifier = (value: string) => { if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(value)) throw new HttpError(400, "Unsafe Oracle identifier", "UNSAFE_IDENTIFIER"); return `"${value.toUpperCase()}"`; };
const operatorSql: Record<Filter["operator"], string> = { EQ: "=", NE: "<>", IN: "IN", NOT_IN: "NOT IN", GT: ">", GTE: ">=", LT: "<", LTE: "<=", BETWEEN: "BETWEEN", IS_NULL: "IS NULL", IS_NOT_NULL: "IS NOT NULL" };

export async function generateBlockQuery(block: typeof dashboardBlocks.$inferSelect, version: typeof dashboardVersions.$inferSelect, previewLimit = 100, runtimeFilters: Filter[] = []) {
  if (!block.kpiId) throw new HttpError(400, "Select an approved or certified KPI", "KPI_REQUIRED");
  const kpi = (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.id, block.kpiId), eq(kpiDefinitions.modelId, version.businessContextModelId), isNull(kpiDefinitions.deletedAt))).limit(1))[0];
  if (!kpi) throw new HttpError(400, "KPI definition is unavailable", "KPI_NOT_APPROVED");
  let lockedKpi = kpi;
  if (block.kpiVersion !== kpi.version) { const snapshot = (await db.select().from(kpiDefinitionVersions).where(and(eq(kpiDefinitionVersions.kpiId, kpi.id), eq(kpiDefinitionVersions.versionNumber, block.kpiVersion!))).limit(1))[0]; if (!snapshot) throw new HttpError(409, "The locked KPI version snapshot is unavailable", "KPI_VERSION_MISMATCH"); lockedKpi = { ...kpi, ...(JSON.parse(snapshot.snapshotJson) as typeof kpi), id: kpi.id, modelId: kpi.modelId, dataSourceId: kpi.dataSourceId, version: snapshot.versionNumber, status: snapshot.status === "CERTIFIED" ? "CERTIFIED" : "APPROVED" }; } else if (!["APPROVED", "CERTIFIED"].includes(kpi.status)) throw new HttpError(400, "Only approved or certified KPIs may be used", "KPI_NOT_APPROVED");
  const compiled = await compileKpi(lockedKpi);
  const filters = [...(JSON.parse(block.filtersJson || "[]") as Filter[]), ...runtimeFilters];
  const visualizationConfig = (() => { try { return JSON.parse(block.visualizationConfigJson || "{}") as { timeGrain?: "DAY"|"WEEK"|"MONTH"|"QUARTER"|"YEAR"; dimensionFieldIds?: string[] }; } catch { return {}; } })();
  const dimensionFieldIds = [...new Set((visualizationConfig.dimensionFieldIds?.length ? visualizationConfig.dimensionFieldIds : block.dimensionFieldId ? [block.dimensionFieldId] : []).slice(0, block.blockType === "PIVOT_TABLE" ? 2 : 1))];
  const dimensions = dimensionFieldIds.map((businessFieldId,index) => ({ businessFieldId, granularity: (index === 0 && (block.visualizationType === "LINE" || block.visualizationType === "AREA") ? visualizationConfig.timeGrain || "MONTH" : "NONE") as "DAY"|"WEEK"|"MONTH"|"QUARTER"|"YEAR"|"NONE" }));
  const plan = queryPlanSchema.parse({ businessContextVersionId: version.businessContextVersionId, dataSourceId: version.dataSourceId, measure: { kpiId: kpi.id, kpiVersion: kpi.version }, dimensions, filters, sort: [], limit: Math.min(500, Math.max(1, previewLimit)), relationshipPathIds: compiled.relationships.filter((item) => item.approvalStatus === "APPROVED").map((item) => item.id) });
  const fieldIds = [...new Set([...dimensions.map((item) => item.businessFieldId), ...filters.map((item) => item.businessFieldId)])];
  const extraFields = fieldIds.length ? await db.select().from(businessFields).where(and(inArray(businessFields.id, fieldIds), isNull(businessFields.deletedAt))) : [];
  const fieldMap = new Map([...compiled.fields, ...extraFields.filter((field) => fieldIds.includes(field.id))].map((field) => [field.id, field]));
  const binds: Record<string, Bind> = { ...compiled.binds, dashboardRowLimit: plan.limit }; let bindIndex = Object.keys(binds).length;
  const bind = (value: Bind) => { const key = `d${++bindIndex}`; binds[key] = value; return `:${key}`; };
  const column = (fieldId: string) => { const field = fieldMap.get(fieldId); if (!field || field.approvalStatus !== "APPROVED" || !field.visibleToDashboardCreator) throw new HttpError(400, "Dashboard field is not published for builder use", "FIELD_NOT_ALLOWED"); const alias = compiled.aliases.get(field.businessObjectId); if (!alias) throw new HttpError(400, "No approved relationship path connects this field to the KPI", "MISSING_RELATIONSHIP"); return { field, sql: `${alias}.${identifier(field.physicalColumnName)}` }; };
  let dimensionSql = ""; let groupSql = ""; let orderSql = "";
  if (dimensions.length) { const expressions=dimensions.map((item)=>{const dim=column(item.businessFieldId);const grainSql={DAY:`TRUNC(${dim.sql})`,WEEK:`TRUNC(${dim.sql}, 'IW')`,MONTH:`TRUNC(${dim.sql}, 'MM')`,QUARTER:`TRUNC(${dim.sql}, 'Q')`,YEAR:`TRUNC(${dim.sql}, 'YYYY')`,NONE:dim.sql} as const;return grainSql[item.granularity];});dimensionSql=expressions.map((expression,index)=>`${expression} AS ${index===0?"DIMENSION_VALUE":`DIMENSION_VALUE_${index+1}`}`).join(", ")+", ";groupSql=` GROUP BY ${expressions.join(", ")}`;orderSql=dimensions[0].granularity==="NONE"?" ORDER BY KPI_VALUE DESC":" ORDER BY DIMENSION_VALUE"; }
  const predicates = filters.map((filter) => { const target = column(filter.businessFieldId); if (!target.field.filterable) throw new HttpError(400, "Selected field is not filterable", "FILTER_NOT_ALLOWED"); const op = operatorSql[filter.operator]; if (["IS_NULL", "IS_NOT_NULL"].includes(filter.operator)) return `${target.sql} ${op}`; if (["IN", "NOT_IN"].includes(filter.operator) && filter.values.length) return `${target.sql} ${op} (${filter.values.map(bind).join(", ")})`; if (filter.operator === "BETWEEN" && filter.values.length === 2) return `${target.sql} BETWEEN ${bind(filter.values[0])} AND ${bind(filter.values[1])}`; if (filter.values.length === 1) return `${target.sql} ${op} ${bind(filter.values[0])}`; throw new HttpError(400, "Filter values do not match the operator", "INVALID_FILTER"); });
  const sql = assertSafeDashboardSql(`SELECT ${dimensionSql}${compiled.expression} AS KPI_VALUE FROM ${compiled.fromSql}${predicates.length ? ` WHERE ${predicates.join(" AND ")}` : ""}${groupSql}${orderSql} FETCH FIRST :dashboardRowLimit ROWS ONLY`);
  return { plan, sql, binds, fingerprint: createHash("sha256").update(sql).digest("hex"), kpi: lockedKpi };
}

let activePreviews = 0;
export async function previewDashboardBlock(dashboardId: string, blockId: string, user: AuthenticatedUser) {
  const block = (await db.select().from(dashboardBlocks).where(eq(dashboardBlocks.id, blockId)).limit(1))[0]; if (!block) throw new HttpError(404, "Dashboard block not found", "NOT_FOUND");
  const version = (await db.select().from(dashboardVersions).where(and(eq(dashboardVersions.id, block.dashboardVersionId), eq(dashboardVersions.dashboardId, dashboardId))).limit(1))[0]; if (!version) throw new HttpError(404, "Dashboard block not found", "NOT_FOUND");
  await requireDashboardDataSource(user, version.dataSourceId); if (activePreviews >= 3) throw new HttpError(429, "Dashboard preview concurrency limit reached", "QUERY_LIMIT");
  const generated = await generateBlockQuery(block, version, 100); const source = await getDataSource(version.dataSourceId); if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND");
  activePreviews += 1; const started = Date.now();
  try {
    const rows = await withOracleConnection(source, async (connection, outFormat) => ((await connection.execute(generated.sql, generated.binds, { outFormat, maxRows: 100 })).rows ?? []) as Array<Record<string, unknown>>);
    const visualizationConfig = (() => { try { return JSON.parse(block.visualizationConfigJson || "{}") as { datasetShape?: string }; } catch { return {}; } })();
    const inferredShape: DatasetShape = block.blockType === "KPI_CARD" ? "SINGLE_VALUE" : block.blockType === "TREND_CHART" ? "TIME_SERIES" : block.blockType === "DISTRIBUTION_CHART" ? "CATEGORY_DISTRIBUTION" : block.blockType === "COMPARISON_CHART" ? "CATEGORY_COMPARISON" : block.blockType === "PROGRESS_STATUS" ? "ACTUAL_VS_TARGET" : block.blockType === "PIVOT_TABLE" ? "MATRIX" : block.blockType === "FUNNEL" ? "STAGE_FUNNEL" : block.blockType === "EXCEPTION_LIST" ? "EXCEPTION_RECORDS" : "SUMMARY_RECORDS";
    const datasetShape = datasetShapes.includes(visualizationConfig.datasetShape as DatasetShape) ? visualizationConfig.datasetShape as DatasetShape : inferredShape;
    const datasetValidation = validateDatasetRows(rows.slice(0, 100) as Array<Record<string, unknown>>, datasetShape);
    const preview = { state: "LIVE_PREVIEW", rows: rows.slice(0, 100), rowCount: rows.length, rowLimit: 100, durationMs: Date.now() - started, executedAt: new Date().toISOString(), dataSourceId: version.dataSourceId, datasetShape, datasetValidation };
    if (Buffer.byteLength(JSON.stringify(preview)) > 1_000_000) throw new HttpError(413, "Preview result exceeds the 1 MB limit", "RESULT_LIMIT");
    await db.update(dashboardBlocks).set({ queryPlanJson: JSON.stringify(generated.plan), generatedSql: generated.sql, queryFingerprint: generated.fingerprint, bindParametersJson: JSON.stringify(Object.keys(generated.binds)), previewStatus: "PASSED", previewJson: JSON.stringify(preview), previewedAt: new Date(), validationStatus: datasetValidation.valid ? datasetValidation.warnings.length ? "PASSED_WITH_WARNING" : "PASSED" : "FAILED", updatedAt: new Date(), updatedBy: user.id }).where(eq(dashboardBlocks.id, blockId));
    return { ...preview, generatedSql: generated.sql, queryPlan: generated.plan, formulaAst: JSON.parse(generated.kpi.formulaAst) };
  } catch (error) {
    await db.update(dashboardBlocks).set({ previewStatus: "FAILED", previewJson: JSON.stringify({ state: "QUERY_VALIDATION_FAILED", error: "Preview could not be completed safely." }), updatedAt: new Date(), updatedBy: user.id }).where(eq(dashboardBlocks.id, blockId));
    throw error;
  } finally { activePreviews -= 1; }
}
