import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  businessContextModels,
  businessContextModelVersions,
  businessFields,
  dashboardBlocks,
  dashboardGlobalFilters,
  dashboardPublications,
  dashboardVersions,
  dashboards,
  kpiDefinitions,
  kpiDefinitionVersions,
  kpiSourceFields,
  kpiValidationResults,
  users,
} from "../lib/db/schema";
import { db, pool } from "../lib/db";
import { compileKpi } from "../lib/business-context/kpi";
import { getDataSource } from "../lib/data-sources/service";
import { withOracleConnection } from "../lib/data-sources/oracle";
import { generateBlockQuery } from "../lib/dashboards/query";
import { validateDatasetRows, type DatasetShape } from "../lib/dashboards/planning";

const MODEL_NAME = "Maintenance Context";
const DASHBOARD_NAME = "Work Order Management";
const DASHBOARD_SLUG = "work-order-management";
const DASHBOARD_ID = "70000000-0000-4000-8000-000000000001";
const VERSION_ID = "71000000-0000-4000-8000-000000000001";
const PUBLICATION_ID = "73000000-0000-4000-8000-000000000001";
const LAYOUT_TEMPLATE_ID = "10000000-0000-4000-8000-000000000002";

const KPI_IDS: Record<string, string> = {
  WORK_REQUEST_WORK_ORDERS: "60000000-0000-4000-8000-000000000001",
  RELEASED_WORK_ORDERS: "60000000-0000-4000-8000-000000000002",
  STARTED_WORK_ORDERS: "60000000-0000-4000-8000-000000000003",
  WORK_DONE_ACTIVE_RECORDS: "60000000-0000-4000-8000-000000000004",
  FAULT_REPORT_WORK_ORDERS: "60000000-0000-4000-8000-000000000005",
};

type BlockSeed = {
  id: string;
  blockType: "KPI_CARD" | "TREND_CHART" | "COMPARISON_CHART" | "DISTRIBUTION_CHART";
  title: string;
  description: string;
  businessQuestion: string;
  decisionSupported: string;
  kpiId: string;
  kpiVersion: number;
  dimensionFieldId: string | null;
  visualizationType: "NUMBER" | "LINE" | "BAR" | "HORIZONTAL_BAR" | "DONUT";
  visualizationConfig: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
  sortOrder: number;
};

function filteredCountAst(workOrderFieldId: string, stateFieldId: string, state: string) {
  return {
    type: "aggregate",
    function: "COUNT_DISTINCT",
    expression: { type: "field", businessFieldId: workOrderFieldId },
    filters: [{ businessFieldId: stateFieldId, operator: "EQ", values: [state] }],
  } as const;
}

async function main() {
  const now = new Date();
  const [admin] = await db.select().from(users).where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE"))).limit(1);
  if (!admin) throw new Error("An active ADMIN user is required");
  const [model] = await db.select().from(businessContextModels).where(and(eq(businessContextModels.name, MODEL_NAME), eq(businessContextModels.status, "PUBLISHED"), isNull(businessContextModels.deletedAt))).limit(1);
  if (!model) throw new Error(`Published ${MODEL_NAME} was not found`);
  const [contextVersion] = await db.select().from(businessContextModelVersions).where(and(eq(businessContextModelVersions.modelId, model.id), eq(businessContextModelVersions.status, "PUBLISHED"), isNull(businessContextModelVersions.deletedAt))).orderBy(desc(businessContextModelVersions.versionNumber)).limit(1);
  if (!contextVersion) throw new Error("A published Maintenance Context version was not found");

  const requiredColumns = ["WO_NO", "STATE", "WORK_TYPE_ID", "MCH_CODE", "MCH_CODE_DESCRIPTION", "ORG_CODE", "LAST_ACTIVITY_DATE"];
  const fields = await db.select().from(businessFields).where(and(eq(businessFields.modelId, model.id), inArray(businessFields.physicalColumnName, requiredColumns), eq(businessFields.approvalStatus, "APPROVED"), eq(businessFields.visibleToDashboardCreator, true), isNull(businessFields.deletedAt)));
  const byColumn = new Map(fields.map((field) => [field.physicalColumnName, field]));
  for (const name of requiredColumns) if (!byColumn.has(name)) throw new Error(`Approved dashboard field ${name} was not found`);
  const workOrder = byColumn.get("WO_NO")!;
  const state = byColumn.get("STATE")!;
  const workType = byColumn.get("WORK_TYPE_ID")!;
  const equipmentCode = byColumn.get("MCH_CODE")!;
  const equipmentDescription = byColumn.get("MCH_CODE_DESCRIPTION")!;
  const organization = byColumn.get("ORG_CODE")!;
  const lastActivity = byColumn.get("LAST_ACTIVITY_DATE")!;

  const kpiSeeds = [
    { code: "WORK_REQUEST_WORK_ORDERS", name: "Work Requests", state: "WorkRequest", question: "How many active work orders are still in the WorkRequest state?", reason: "WorkRequest is the largest actual state and represents the main visible backlog segment." },
    { code: "RELEASED_WORK_ORDERS", name: "Released Work Orders", state: "Released", question: "How many active work orders are released?", reason: "Released is a populated operational state with 228 records at profiling time." },
    { code: "STARTED_WORK_ORDERS", name: "Started Work Orders", state: "Started", question: "How many active work orders have started?", reason: "Started directly identifies work in execution without inventing a broader status mapping." },
    { code: "WORK_DONE_ACTIVE_RECORDS", name: "Work Done (Active View)", state: "WorkDone", question: "How many records in the active-work-order view are in WorkDone state?", reason: "The state is present and meaningful, but is explicitly not treated as closed-history data." },
    { code: "FAULT_REPORT_WORK_ORDERS", name: "Fault Report Work Orders", state: "FaultReport", question: "How many active work orders are in FaultReport state?", reason: "FaultReport is an observed source state and highlights a distinct operational queue." },
  ];

  const kpiRows = new Map<string, typeof kpiDefinitions.$inferSelect>();
  for (const seed of kpiSeeds) {
    const [existing] = await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, model.id), eq(kpiDefinitions.code, seed.code), isNull(kpiDefinitions.deletedAt))).limit(1);
    const id = existing?.id ?? KPI_IDS[seed.code];
    const formulaAst = JSON.stringify(filteredCountAst(workOrder.id, state.id, seed.state));
    const values = {
      modelId: model.id,
      dataSourceId: model.dataSourceId,
      code: seed.code,
      name: seed.name,
      shortName: seed.name,
      description: `COUNT DISTINCT IFSAPP.ACTIVE_WORK_ORDER.WO_NO filtered to STATE = '${seed.state}'. Source profile: STATE is fully populated with 9 distinct values. ${seed.reason}`,
      businessObjective: "Monitor the current active-work-order backlog using unmodified Oracle state values.",
      businessQuestion: seed.question,
      tags: JSON.stringify(["maintenance", "work-order", "oracle-profiled", "active-view"]),
      measureType: "COUNT" as const,
      formulaAst,
      aggregation: "COUNT_DISTINCT",
      distinctRule: "Distinct WO_NO; ACTIVE_WORK_ORDER has one unique WO_NO per profiled row.",
      nullHandling: "IGNORE" as const,
      divisionByZeroHandling: "NULL" as const,
      decimalPrecision: 0,
      unit: "work orders",
      dateLogic: "Point-in-time active view; no completion-history inference.",
      dataFreshnessRequirement: "On demand from Oracle",
      recommendedVisualization: "KPI_CARD",
      displayFormat: "#,##0",
      status: "DRAFT" as const,
      certificationStatus: "UNVERIFIED" as const,
      draftedBy: admin.id,
      version: existing?.version ?? 1,
      changeReason: "Defined from direct Oracle profiling; no synthetic records or inferred status translation.",
      updatedBy: admin.id,
      updatedAt: now,
      deletedAt: null,
    };
    if (existing) await db.update(kpiDefinitions).set(values).where(eq(kpiDefinitions.id, id));
    else await db.insert(kpiDefinitions).values({ id, ...values, createdBy: admin.id, createdAt: now });
    const [draft] = await db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, id)).limit(1);
    kpiRows.set(seed.code, draft);
  }

  const source = await getDataSource(model.dataSourceId);
  if (!source) throw new Error("Configured Oracle source was not found");

  for (const [code, kpi] of kpiRows) {
    const compiled = await compileKpi(kpi);
    const result = await withOracleConnection(source, async (connection, outFormat) => connection.execute(compiled.sql, compiled.binds, { outFormat, maxRows: 1 }));
    const value = (result.rows?.[0] as Record<string, unknown> | undefined)?.KPI_VALUE;
    if (typeof value !== "number") throw new Error(`${code} did not return a numeric KPI value`);
    const approved = { ...kpi, status: "APPROVED" as const, certificationStatus: "TECHNICALLY_VALIDATED" as const, reviewedBy: admin.id, approvedBy: admin.id, approvalDate: now, updatedAt: now };
    await db.transaction(async (tx) => {
      await tx.update(kpiDefinitions).set({ status: approved.status, certificationStatus: approved.certificationStatus, reviewedBy: admin.id, approvedBy: admin.id, approvalDate: now, updatedAt: now }).where(eq(kpiDefinitions.id, kpi.id));
      await tx.insert(kpiDefinitionVersions).values({ id: randomUUID(), kpiId: kpi.id, versionNumber: kpi.version, status: "APPROVED", snapshotJson: JSON.stringify(approved), changeReason: "Oracle query technically validated by the Work Order Management seed.", approvedBy: admin.id, approvedAt: now, createdBy: admin.id, createdAt: now }).onDuplicateKeyUpdate({ set: { status: "APPROVED", snapshotJson: JSON.stringify(approved), changeReason: "Oracle query technically validated by the Work Order Management seed.", approvedBy: admin.id, approvedAt: now } });
      await tx.insert(kpiSourceFields).values([
        { id: randomUUID(), kpiId: kpi.id, businessObjectId: workOrder.businessObjectId, businessFieldId: workOrder.id, role: "MEASURE", createdBy: admin.id, createdAt: now },
        { id: randomUUID(), kpiId: kpi.id, businessObjectId: state.businessObjectId, businessFieldId: state.id, role: "FILTER", createdBy: admin.id, createdAt: now },
      ]).onDuplicateKeyUpdate({ set: { deletedAt: null } });
      await tx.insert(kpiValidationResults).values({ id: randomUUID(), kpiId: kpi.id, result: "PASSED", ruleCode: "ORACLE_EXECUTION", severity: "INFO", message: `Read-only Oracle validation passed with KPI_VALUE=${value}.`, businessObjectId: workOrder.businessObjectId, validatedBy: admin.id, validatedAt: now, createdAt: now });
    });
    kpiRows.set(code, approved);
  }

  const [totalKpi] = await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, model.id), eq(kpiDefinitions.code, "ACTIVE_WORK_ORDERS_COUNT"), inArray(kpiDefinitions.status, ["APPROVED", "CERTIFIED"]), isNull(kpiDefinitions.deletedAt))).limit(1);
  if (!totalKpi) throw new Error("The governed ACTIVE_WORK_ORDERS_COUNT KPI was not found");

  const kpi = (code: string) => kpiRows.get(code)!;
  const blocks: BlockSeed[] = [
    { id: "72000000-0000-4000-8000-000000000001", blockType: "KPI_CARD", title: "Active Work Orders", description: "Distinct work orders currently returned by IFSAPP.ACTIVE_WORK_ORDER.", businessQuestion: "How large is the current active-work-order backlog?", decisionSupported: "Assess total maintenance workload.", kpiId: totalKpi.id, kpiVersion: totalKpi.version, dimensionFieldId: null, visualizationType: "NUMBER", visualizationConfig: { datasetShape: "SINGLE_VALUE" }, position: { x: 0, y: 0, w: 2, h: 2 }, sortOrder: 0 },
    { id: "72000000-0000-4000-8000-000000000002", blockType: "KPI_CARD", title: "Work Requests", description: "Active records whose exact Oracle STATE is WorkRequest.", businessQuestion: kpi("WORK_REQUEST_WORK_ORDERS").businessQuestion!, decisionSupported: "Size the main intake backlog.", kpiId: kpi("WORK_REQUEST_WORK_ORDERS").id, kpiVersion: kpi("WORK_REQUEST_WORK_ORDERS").version, dimensionFieldId: null, visualizationType: "NUMBER", visualizationConfig: { datasetShape: "SINGLE_VALUE" }, position: { x: 2, y: 0, w: 2, h: 2 }, sortOrder: 1 },
    { id: "72000000-0000-4000-8000-000000000003", blockType: "KPI_CARD", title: "Released", description: "Active records whose exact Oracle STATE is Released.", businessQuestion: kpi("RELEASED_WORK_ORDERS").businessQuestion!, decisionSupported: "Monitor work ready for execution.", kpiId: kpi("RELEASED_WORK_ORDERS").id, kpiVersion: kpi("RELEASED_WORK_ORDERS").version, dimensionFieldId: null, visualizationType: "NUMBER", visualizationConfig: { datasetShape: "SINGLE_VALUE" }, position: { x: 4, y: 0, w: 2, h: 2 }, sortOrder: 2 },
    { id: "72000000-0000-4000-8000-000000000004", blockType: "KPI_CARD", title: "Started", description: "Active records whose exact Oracle STATE is Started.", businessQuestion: kpi("STARTED_WORK_ORDERS").businessQuestion!, decisionSupported: "Monitor work currently in execution.", kpiId: kpi("STARTED_WORK_ORDERS").id, kpiVersion: kpi("STARTED_WORK_ORDERS").version, dimensionFieldId: null, visualizationType: "NUMBER", visualizationConfig: { datasetShape: "SINGLE_VALUE" }, position: { x: 6, y: 0, w: 2, h: 2 }, sortOrder: 3 },
    { id: "72000000-0000-4000-8000-000000000005", blockType: "KPI_CARD", title: "Work Done (Active View)", description: "WorkDone state within the active view; not a closed-work history KPI.", businessQuestion: kpi("WORK_DONE_ACTIVE_RECORDS").businessQuestion!, decisionSupported: "Identify work-done records still exposed as active.", kpiId: kpi("WORK_DONE_ACTIVE_RECORDS").id, kpiVersion: kpi("WORK_DONE_ACTIVE_RECORDS").version, dimensionFieldId: null, visualizationType: "NUMBER", visualizationConfig: { datasetShape: "SINGLE_VALUE" }, position: { x: 8, y: 0, w: 2, h: 2 }, sortOrder: 4 },
    { id: "72000000-0000-4000-8000-000000000006", blockType: "KPI_CARD", title: "Fault Reports", description: "Active records whose exact Oracle STATE is FaultReport.", businessQuestion: kpi("FAULT_REPORT_WORK_ORDERS").businessQuestion!, decisionSupported: "Track the fault-report queue.", kpiId: kpi("FAULT_REPORT_WORK_ORDERS").id, kpiVersion: kpi("FAULT_REPORT_WORK_ORDERS").version, dimensionFieldId: null, visualizationType: "NUMBER", visualizationConfig: { datasetShape: "SINGLE_VALUE" }, position: { x: 10, y: 0, w: 2, h: 2 }, sortOrder: 5 },
    { id: "72000000-0000-4000-8000-000000000007", blockType: "DISTRIBUTION_CHART", title: "Work Orders by State", description: "Uses the 9 unmodified state labels found in Oracle.", businessQuestion: "How is the active backlog distributed by current Oracle state?", decisionSupported: "Prioritize lifecycle queues without inferred translations.", kpiId: totalKpi.id, kpiVersion: totalKpi.version, dimensionFieldId: state.id, visualizationType: "HORIZONTAL_BAR", visualizationConfig: { datasetShape: "CATEGORY_DISTRIBUTION", dimensionFieldIds: [state.id], categoryLimit: 9, topN: 9 }, position: { x: 0, y: 2, w: 6, h: 4 }, sortOrder: 6 },
    { id: "72000000-0000-4000-8000-000000000008", blockType: "COMPARISON_CHART", title: "Work Orders by Type", description: "Counts distinct active work orders by the actual WORK_TYPE_ID values.", businessQuestion: "Which work-order types make up the active workload?", decisionSupported: "Plan capacity for the dominant work types.", kpiId: totalKpi.id, kpiVersion: totalKpi.version, dimensionFieldId: workType.id, visualizationType: "BAR", visualizationConfig: { datasetShape: "CATEGORY_COMPARISON", dimensionFieldIds: [workType.id], categoryLimit: 12, topN: 12 }, position: { x: 6, y: 2, w: 6, h: 4 }, sortOrder: 7 },
    { id: "72000000-0000-4000-8000-000000000009", blockType: "COMPARISON_CHART", title: "Work Orders by Equipment Type", description: "Top equipment descriptions by active work-order count; 38 non-null descriptions were found.", businessQuestion: "Which aircraft or equipment descriptions carry the most active work?", decisionSupported: "Focus maintenance capacity on the most affected fleets.", kpiId: totalKpi.id, kpiVersion: totalKpi.version, dimensionFieldId: equipmentDescription.id, visualizationType: "HORIZONTAL_BAR", visualizationConfig: { datasetShape: "CATEGORY_COMPARISON", dimensionFieldIds: [equipmentDescription.id], categoryLimit: 10, topN: 10 }, position: { x: 0, y: 6, w: 7, h: 4 }, sortOrder: 8 },
    { id: "72000000-0000-4000-8000-000000000010", blockType: "TREND_CHART", title: "Active Work Order Activity Trend", description: "Annual count by LAST_ACTIVITY_DATE, the fully populated reliable activity date. Annual grain keeps the full 2020–2026 series visible in the supported renderer. This is not a creation or completion trend.", businessQuestion: "When were active work orders most recently updated?", decisionSupported: "See whether the active backlog is receiving recent operational attention.", kpiId: totalKpi.id, kpiVersion: totalKpi.version, dimensionFieldId: lastActivity.id, visualizationType: "LINE", visualizationConfig: { datasetShape: "TIME_SERIES", dimensionFieldIds: [lastActivity.id], timeGrain: "YEAR" }, position: { x: 7, y: 6, w: 5, h: 4 }, sortOrder: 9 },
    { id: "72000000-0000-4000-8000-000000000011", blockType: "COMPARISON_CHART", title: "Work Orders by Maintenance Object", description: "Top maintenance-object codes by distinct active work orders; limited to readable Top 10 output.", businessQuestion: "Which specific maintenance objects have the largest active workload?", decisionSupported: "Identify concentrated asset-level backlog.", kpiId: totalKpi.id, kpiVersion: totalKpi.version, dimensionFieldId: equipmentCode.id, visualizationType: "HORIZONTAL_BAR", visualizationConfig: { datasetShape: "CATEGORY_COMPARISON", dimensionFieldIds: [equipmentCode.id], categoryLimit: 10, topN: 10 }, position: { x: 0, y: 10, w: 7, h: 4 }, sortOrder: 10 },
    { id: "72000000-0000-4000-8000-000000000012", blockType: "COMPARISON_CHART", title: "Work Orders by Organization", description: "Actual ORG_CODE distribution. TZ-T is dominant, so the chart is retained mainly for accountability and filter context.", businessQuestion: "Which maintenance organizations own the active work orders?", decisionSupported: "Route operational follow-up by responsible organization code.", kpiId: totalKpi.id, kpiVersion: totalKpi.version, dimensionFieldId: organization.id, visualizationType: "BAR", visualizationConfig: { datasetShape: "CATEGORY_COMPARISON", dimensionFieldIds: [organization.id], categoryLimit: 6, topN: 6 }, position: { x: 7, y: 10, w: 5, h: 4 }, sortOrder: 11 },
  ];

  const versionForQuery = { businessContextModelId: model.id, businessContextVersionId: contextVersion.id, dataSourceId: model.dataSourceId } as typeof dashboardVersions.$inferSelect;
  const validatedBlocks: Array<BlockSeed & { generatedSql: string; queryPlanJson: string; queryFingerprint: string; bindParametersJson: string; previewJson: string; validationStatus: "PASSED" | "PASSED_WITH_WARNING" }> = [];
  for (const block of blocks) {
    const blockForQuery = { ...block, filtersJson: "[]", visualizationConfigJson: JSON.stringify(block.visualizationConfig) } as unknown as typeof dashboardBlocks.$inferSelect;
    const generated = await generateBlockQuery(blockForQuery, versionForQuery, 100);
    const result = await withOracleConnection(source, async (connection, outFormat) => connection.execute(generated.sql, generated.binds, { outFormat, maxRows: 100 }));
    const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
    const shape = block.visualizationConfig.datasetShape as DatasetShape;
    const datasetValidation = validateDatasetRows(rows, shape);
    if (!datasetValidation.valid) throw new Error(`${block.title} failed dataset validation: ${datasetValidation.warnings.join("; ")}`);
    const preview = { state: "LIVE_PREVIEW", rows, rowCount: rows.length, rowLimit: 100, durationMs: null, executedAt: now.toISOString(), dataSourceId: model.dataSourceId, datasetShape: shape, datasetValidation };
    validatedBlocks.push({ ...block, generatedSql: generated.sql, queryPlanJson: JSON.stringify(generated.plan), queryFingerprint: createHash("sha256").update(generated.sql).digest("hex"), bindParametersJson: JSON.stringify(Object.keys(generated.binds)), previewJson: JSON.stringify(preview), validationStatus: datasetValidation.warnings.length ? "PASSED_WITH_WARNING" : "PASSED" });
  }

  const optionColumns = [state, workType, equipmentDescription, organization];
  const optionValues = new Map<string, Array<string | number>>();
  for (const field of optionColumns) {
    const sql = `SELECT DISTINCT "${field.physicalColumnName}" AS FILTER_VALUE FROM "IFSAPP"."ACTIVE_WORK_ORDER" WHERE "${field.physicalColumnName}" IS NOT NULL ORDER BY FILTER_VALUE FETCH FIRST :optionLimit ROWS ONLY`;
    const result = await withOracleConnection(source, async (connection, outFormat) => connection.execute(sql, { optionLimit: 100 }, { outFormat, maxRows: 100 }));
    optionValues.set(field.id, (result.rows as Array<{ FILTER_VALUE: string | number }>).map((row) => row.FILTER_VALUE));
  }
  const filterTests = [
    { businessFieldId: state.id, operator: "EQ" as const, values: [String(optionValues.get(state.id)?.[0])] },
    { businessFieldId: workType.id, operator: "EQ" as const, values: [String(optionValues.get(workType.id)?.[0])] },
    { businessFieldId: equipmentDescription.id, operator: "EQ" as const, values: [String(optionValues.get(equipmentDescription.id)?.[0])] },
    { businessFieldId: organization.id, operator: "EQ" as const, values: [String(optionValues.get(organization.id)?.[0])] },
  ];
  const firstBlock = { ...blocks[0], filtersJson: "[]", visualizationConfigJson: JSON.stringify(blocks[0].visualizationConfig) } as unknown as typeof dashboardBlocks.$inferSelect;
  for (const filter of filterTests) {
    const generated = await generateBlockQuery(firstBlock, versionForQuery, 100, [filter] as Parameters<typeof generateBlockQuery>[3]);
    await withOracleConnection(source, async (connection, outFormat) => connection.execute(generated.sql, generated.binds, { outFormat, maxRows: 100 }));
  }

  const [existingDashboard] = await db.select().from(dashboards).where(eq(dashboards.slug, DASHBOARD_SLUG)).limit(1);
  const dashboardId = existingDashboard?.id ?? DASHBOARD_ID;
  const versionId = existingDashboard?.currentPublishedVersionId ?? existingDashboard?.currentDraftVersionId ?? VERSION_ID;
  const allBlockIds = validatedBlocks.map((block) => block.id);
  const filters = [
    { id: "74000000-0000-4000-8000-000000000001", name: "Work Order State", field: state, filterType: "MULTI_SELECT" as const, allowed: optionValues.get(state.id)!, configuration: { controlType: "CHECKBOX_GROUP", selectionMode: "MULTIPLE", placeholder: "Select work order states", allowSelectAll: true, allowClear: true, searchable: false, searchMode: "CLIENT", minimumSearchCharacters: 0, pageSize: 30, sortOrder: "ALPHABETICAL", maximumSelectedItems: 9, dateFormat: "DD/MM/YYYY", numberFormat: "#,##0.##", relativeDatePresets: [], dependsOn: [], applyMode: "MANUAL", position: 0, reason: "Nine fully populated actual Oracle states." } },
    { id: "74000000-0000-4000-8000-000000000002", name: "Work Order Type", field: workType, filterType: "MULTI_SELECT" as const, allowed: optionValues.get(workType.id)!, configuration: { controlType: "SEARCHABLE_MULTI_SELECT", selectionMode: "MULTIPLE", placeholder: "Select work order types", allowSelectAll: true, allowClear: true, searchable: true, searchMode: "CLIENT", minimumSearchCharacters: 0, pageSize: 30, sortOrder: "ALPHABETICAL", maximumSelectedItems: 12, dateFormat: "DD/MM/YYYY", numberFormat: "#,##0.##", relativeDatePresets: [], dependsOn: [], applyMode: "MANUAL", position: 1, reason: "Twelve populated actual Oracle work-type codes." } },
    { id: "74000000-0000-4000-8000-000000000003", name: "Aircraft / Equipment", field: equipmentDescription, filterType: "MULTI_SELECT" as const, allowed: optionValues.get(equipmentDescription.id)!, configuration: { controlType: "SEARCHABLE_MULTI_SELECT", selectionMode: "MULTIPLE", placeholder: "Select aircraft or equipment", allowSelectAll: true, allowClear: true, searchable: true, searchMode: "CLIENT", minimumSearchCharacters: 0, pageSize: 30, sortOrder: "ALPHABETICAL", maximumSelectedItems: 20, dateFormat: "DD/MM/YYYY", numberFormat: "#,##0.##", relativeDatePresets: [], dependsOn: [], applyMode: "MANUAL", position: 2, reason: "Thirty-eight meaningful equipment descriptions; client-side search keeps the control compact." } },
    { id: "74000000-0000-4000-8000-000000000004", name: "Maintenance Organization", field: organization, filterType: "MULTI_SELECT" as const, allowed: optionValues.get(organization.id)!, configuration: { controlType: "CHECKBOX_GROUP", selectionMode: "MULTIPLE", placeholder: "Select organization codes", allowSelectAll: true, allowClear: true, searchable: false, searchMode: "CLIENT", minimumSearchCharacters: 0, pageSize: 30, sortOrder: "ALPHABETICAL", maximumSelectedItems: 6, dateFormat: "DD/MM/YYYY", numberFormat: "#,##0.##", relativeDatePresets: [], dependsOn: [], applyMode: "MANUAL", position: 3, reason: "Six fully populated organization codes." } },
  ];

  await db.transaction(async (tx) => {
    if (!existingDashboard) await tx.insert(dashboards).values({ id: dashboardId, name: DASHBOARD_NAME, slug: DASHBOARD_SLUG, description: "Current active work-order backlog and operational distribution derived only from the profiled IFSAPP.ACTIVE_WORK_ORDER Oracle view.", category: "Maintenance", ownerUserId: admin.id, businessOwnerUserId: admin.id, currentDraftVersionId: null, currentPublishedVersionId: null, status: "DRAFT", visibility: "WORKSPACE", exportAllowed: false, aiCopilotAllowed: true, underlyingDataAllowed: false, drillDownAllowed: false, isFeatured: true, viewCount: 0, createdBy: admin.id, updatedBy: admin.id, createdAt: now, updatedAt: now });
    else await tx.update(dashboards).set({ name: DASHBOARD_NAME, description: "Current active work-order backlog and operational distribution derived only from the profiled IFSAPP.ACTIVE_WORK_ORDER Oracle view.", category: "Maintenance", status: "DRAFT", visibility: "WORKSPACE", isFeatured: true, updatedBy: admin.id, updatedAt: now }).where(eq(dashboards.id, dashboardId));
    const [existingVersion] = await tx.select().from(dashboardVersions).where(eq(dashboardVersions.id, versionId)).limit(1);
    const versionValues = { dashboardId, versionNumber: existingVersion?.versionNumber ?? 1, businessObjective: "Help maintenance leaders understand the current Oracle active-work-order backlog, lifecycle state, workload mix, asset concentration, responsible organization, and recent record activity.", targetAudience: "Maintenance operations leaders, planners, and supervisors", businessQuestionsJson: JSON.stringify(["How large is the current active-work-order backlog?", "How is the backlog distributed by actual Oracle state?", "Which work-order types dominate the active workload?", "Which aircraft, equipment descriptions, and maintenance objects carry the most active work?", "Which maintenance organizations own the workload?", "When were active work orders most recently updated?"]), refreshExpectation: "On demand from Oracle", defaultDateRange: "All available active records", tagsJson: JSON.stringify(["maintenance", "work-order", "oracle", "active-backlog", "profiled"]), businessContextModelId: model.id, businessContextVersionId: contextVersion.id, dataSourceId: model.dataSourceId, layoutTemplateId: LAYOUT_TEMPLATE_ID, layoutJson: JSON.stringify({ columns: 12, responsive: "stack", rows: 14, sourceProfile: { table: "IFSAPP.ACTIVE_WORK_ORDER", profiledRows: 3624, profileDate: now.toISOString(), exclusions: ["No closed/completion history", "Priority 98.4% null", "Staff and vendor fields effectively empty", "23 implausible future registration dates", "No safe computed aging bucket support"] } }), status: "PUBLISHED" as const, revision: (existingVersion?.revision ?? 0) + 1, changeSummary: "Rebuilt from direct Oracle profiling; reference image used only for visual structure.", submittedAt: now, submittedBy: admin.id, approvedAt: now, approvedBy: admin.id, publishedAt: now, publishedBy: admin.id, updatedBy: admin.id, updatedAt: now };
    if (existingVersion) await tx.update(dashboardVersions).set(versionValues).where(eq(dashboardVersions.id, versionId));
    else await tx.insert(dashboardVersions).values({ id: versionId, ...versionValues, createdBy: admin.id, createdAt: now });
    await tx.delete(dashboardGlobalFilters).where(eq(dashboardGlobalFilters.dashboardVersionId, versionId));
    await tx.delete(dashboardBlocks).where(eq(dashboardBlocks.dashboardVersionId, versionId));
    await tx.insert(dashboardBlocks).values(validatedBlocks.map((block) => ({ id: block.id, dashboardVersionId: versionId, blockType: block.blockType, title: block.title, description: block.description, businessQuestion: block.businessQuestion, intendedAudience: "Maintenance operations leaders, planners, and supervisors", decisionSupported: block.decisionSupported, kpiId: block.kpiId, kpiVersion: block.kpiVersion, dimensionFieldId: block.dimensionFieldId, visualizationType: block.visualizationType, queryPlanJson: block.queryPlanJson, generatedSql: block.generatedSql, queryFingerprint: block.queryFingerprint, bindParametersJson: block.bindParametersJson, filtersJson: "[]", visualizationConfigJson: JSON.stringify(block.visualizationConfig), formattingConfigJson: JSON.stringify({ numberFormat: "#,##0", showLegend: block.blockType !== "KPI_CARD" }), positionJson: JSON.stringify(block.position), validationStatus: block.validationStatus, previewStatus: "PASSED" as const, previewJson: block.previewJson, previewedAt: now, isHidden: false, isLocked: false, sortOrder: block.sortOrder, createdBy: admin.id, updatedBy: admin.id, createdAt: now, updatedAt: now })));
    await tx.insert(dashboardGlobalFilters).values(filters.map((filter) => ({ id: filter.id, dashboardVersionId: versionId, name: filter.name, businessFieldId: filter.field.id, filterType: filter.filterType, defaultValueJson: null, allowedValuesJson: filter.allowed.length ? JSON.stringify(filter.allowed) : null, appliesToBlockIdsJson: JSON.stringify(allBlockIds), configurationJson: JSON.stringify(filter.configuration), isRequired: false, isVisible: true, runtimeEditable: true, securityEnforced: false, createdBy: admin.id, updatedBy: admin.id, createdAt: now, updatedAt: now })));
    const snapshot = { dashboard: { id: dashboardId, name: DASHBOARD_NAME, slug: DASHBOARD_SLUG, status: "PUBLISHED" }, version: { id: versionId, businessContextVersionId: contextVersion.id }, blocks: validatedBlocks, filters: filters.map((filter) => ({ id: filter.id, name: filter.name, businessFieldId: filter.field.id, filterType: filter.filterType, allowedValues: filter.allowed, configuration: filter.configuration })), sourceProfile: { table: "IFSAPP.ACTIVE_WORK_ORDER", rowCount: 3624, generatedFromOracle: true } };
    await tx.insert(dashboardPublications).values({ id: PUBLICATION_ID, dashboardId, dashboardVersionId: versionId, snapshotJson: JSON.stringify(snapshot), visibility: "WORKSPACE", allowedRolesJson: JSON.stringify(["ADMIN", "VIEWER", "DASHBOARD_CREATOR", "DATA_SOURCE_CREATOR"]), allowedUserIdsJson: JSON.stringify([]), viewerConfigurationJson: JSON.stringify({ defaultDateRange: "All available active records", source: "ORACLE_READ_ONLY" }), exportAllowed: false, aiCopilotAllowed: true, underlyingDataAllowed: false, drillDownAllowed: false, publishedBy: admin.id, publishedAt: now, unpublishedAt: null }).onDuplicateKeyUpdate({ set: { snapshotJson: JSON.stringify(snapshot), visibility: "WORKSPACE", allowedRolesJson: JSON.stringify(["ADMIN", "VIEWER", "DASHBOARD_CREATOR", "DATA_SOURCE_CREATOR"]), viewerConfigurationJson: JSON.stringify({ defaultDateRange: "All available active records", source: "ORACLE_READ_ONLY" }), publishedBy: admin.id, publishedAt: now, unpublishedAt: null } });
    await tx.update(dashboards).set({ currentDraftVersionId: null, currentPublishedVersionId: versionId, status: "PUBLISHED", lastDataRefreshAt: now, updatedBy: admin.id, updatedAt: now }).where(eq(dashboards.id, dashboardId));
  });

  console.log(JSON.stringify({ dashboardId, versionId, slug: DASHBOARD_SLUG, blocks: validatedBlocks.length, filters: filters.length, kpisCreatedOrUpdated: kpiSeeds.map((seed) => seed.code), oracleReadOnly: true }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
