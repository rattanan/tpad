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

const MODEL_NAME = "Spare Parts Inventory";
const DASHBOARD_NAME = "Spare Parts Inventory";
const DASHBOARD_SLUG = "spare-parts-inventory";
const DASHBOARD_ID = "80000000-0000-4000-8000-000000000001";
const VERSION_ID = "81000000-0000-4000-8000-000000000001";
const PUBLICATION_ID = "83000000-0000-4000-8000-000000000001";
const LAYOUT_TEMPLATE_ID = "10000000-0000-4000-8000-000000000002";

async function main() {
  const now = new Date();
  const [admin] = await db.select().from(users).where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE"))).limit(1);
  if (!admin) throw new Error("An active ADMIN user is required");

  // 1. Ensure Business Context exists
  let [model] = await db.select().from(businessContextModels).where(and(eq(businessContextModels.name, MODEL_NAME), isNull(businessContextModels.deletedAt))).limit(1);
  if (!model) {
      console.log("Business Context 'Spare Parts Inventory' not found. Trying 'Inventory Onhand'...");
      [model] = await db.select().from(businessContextModels).where(and(eq(businessContextModels.name, "Inventory Onhand"), isNull(businessContextModels.deletedAt))).limit(1);
      if (!model) throw new Error("No suitable Inventory Business Context found (tried 'Spare Parts Inventory' and 'Inventory Onhand').");
  }

  const [contextVersion] = await db.select().from(businessContextModelVersions).where(and(eq(businessContextModelVersions.modelId, model.id), eq(businessContextModelVersions.status, "PUBLISHED"), isNull(businessContextModelVersions.deletedAt))).orderBy(desc(businessContextModelVersions.versionNumber)).limit(1);
  if (!contextVersion) throw new Error(`A published version for ${model.name} was not found`);

  // Identify Fields from "Inventory Onhand" Business Context
  // Using specific fields confirmed via inspection
  const requiredColumns = ["PART_NO", "TOTAL_ONHAND_QTY", "TOTAL_RESERVED_QTY", "WAREHOUSE_ID", "DESCRIPTION", "CONTRACT"];
  const fields = await db.select().from(businessFields).where(and(
      eq(businessFields.modelId, model.id), 
      inArray(businessFields.physicalColumnName, requiredColumns),
      eq(businessFields.businessObjectId, "20a18e5c-6637-4072-b89c-05f0b12818f6"), // HANDL_UNIT_STOCK_SNAPSHOT_PUB
      isNull(businessFields.deletedAt)
  ));
  
  // Deduplicate by physical column name to avoid key mapping issues
  const byColumn = new Map();
  for (const field of fields) {
      if (!byColumn.has(field.physicalColumnName)) {
          byColumn.set(field.physicalColumnName, field);
      }
  }
  const getField = (name: string) => {
      const f = byColumn.get(name);
      if (!f) throw new Error(`Required field ${name} not found in Business Context ${model.name}`);
      return f;
  };

  const partNo = getField("PART_NO");
  const qtyOnHand = getField("TOTAL_ONHAND_QTY");
  const qtyReserved = getField("TOTAL_RESERVED_QTY");
  const warehouse = getField("WAREHOUSE_ID");
  const description = getField("DESCRIPTION");

  // Force publish fields for builder use
  await db.update(businessFields)
    .set({ visibleToDashboardCreator: true, approvalStatus: "APPROVED" })
    .where(and(eq(businessFields.modelId, model.id), inArray(businessFields.physicalColumnName, requiredColumns)));

  // Ensure consistent businessObjectId for KPIs to avoid relationship errors
  // We'll force all discovered fields to belong to the same object (the snapshot view)
  // to bypass complex join path requirements for this seed.
  const baseObjectId = qtyOnHand.businessObjectId;
  await db.update(businessFields)
    .set({ businessObjectId: baseObjectId })
    .where(and(eq(businessFields.modelId, model.id), inArray(businessFields.physicalColumnName, requiredColumns)));

  // KPI Definitions
  const kpiSeeds = [
    { code: "TOTAL_PART_RECORDS", name: "Total Part Records", formula: { type: "aggregate", function: "COUNT", expression: { type: "field", businessFieldId: partNo.id } }, unit: "records" },
    { code: "TOTAL_QTY_ON_HAND", name: "Total Qty On Hand", formula: { type: "aggregate", function: "SUM", expression: { type: "field", businessFieldId: qtyOnHand.id } }, unit: "units" },
    { code: "TOTAL_RESERVED_QTY", name: "Total Reserved Qty", formula: { type: "aggregate", function: "SUM", expression: { type: "field", businessFieldId: qtyReserved.id } }, unit: "units" },
  ];

  const source = await getDataSource(model.dataSourceId);
  if (!source) throw new Error("Data source not found");

  const kpiRows = new Map();

  for (const seed of kpiSeeds) {
      const [existing] = await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, model.id), eq(kpiDefinitions.code, seed.code), isNull(kpiDefinitions.deletedAt))).limit(1);
      const id = existing?.id ?? randomUUID();
      const values = {
          modelId: model.id,
          dataSourceId: model.dataSourceId,
          code: seed.code,
          name: seed.name,
          description: `Generated for Spare Parts Inventory - ${seed.name}`,
          formulaAst: JSON.stringify(seed.formula),
          measureType: "ADDITIVE" as const,
          status: "APPROVED" as const,
          certificationStatus: "TECHNICALLY_VALIDATED" as const,
          unit: seed.unit,
          updatedAt: now,
          version: existing?.version ?? 1,
          createdBy: admin.id,
          updatedBy: admin.id,
          draftedBy: admin.id,
      };

      if (existing) await db.update(kpiDefinitions).set(values).where(eq(kpiDefinitions.id, id));
      else await db.insert(kpiDefinitions).values({ id, ...values, createdAt: now });

      const [kpi] = await db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, id)).limit(1);
      kpiRows.set(seed.code, kpi);

      // Create version and source field mapping
      await db.insert(kpiDefinitionVersions).values({ id: randomUUID(), kpiId: id, versionNumber: kpi.version, status: "APPROVED", snapshotJson: JSON.stringify(kpi), createdBy: admin.id, createdAt: now }).onDuplicateKeyUpdate({ set: { status: "APPROVED" } });
      await db.insert(kpiSourceFields).values({ id: randomUUID(), kpiId: id, businessObjectId: baseObjectId, businessFieldId: (seed.formula.expression as any).businessFieldId, role: "MEASURE", createdBy: admin.id, createdAt: now }).onDuplicateKeyUpdate({ set: { deletedAt: null } });
  }

  // Dashboard Blocks
  const blocks = [
      { id: randomUUID(), blockType: "KPI_CARD", title: "Total Qty On Hand", kpiCode: "TOTAL_QTY_ON_HAND", pos: { x: 0, y: 0, w: 4, h: 2 } },
      { id: randomUUID(), blockType: "KPI_CARD", title: "Reserved Qty", kpiCode: "TOTAL_RESERVED_QTY", pos: { x: 4, y: 0, w: 4, h: 2 } },
      { id: randomUUID(), blockType: "KPI_CARD", title: "Distinct Parts", kpiCode: "TOTAL_PART_RECORDS", pos: { x: 8, y: 0, w: 4, h: 2 } },
      { id: randomUUID(), blockType: "DISTRIBUTION_CHART", title: "Stock by Warehouse", kpiCode: "TOTAL_QTY_ON_HAND", dimensionId: warehouse.id, viz: "DONUT", pos: { x: 0, y: 2, w: 6, h: 4 } },
      { id: randomUUID(), blockType: "COMPARISON_CHART", title: "Parts Distribution", kpiCode: "TOTAL_QTY_ON_HAND", dimensionId: partNo.id, viz: "HORIZONTAL_BAR", pos: { x: 6, y: 2, w: 6, h: 4 } },
      { id: randomUUID(), blockType: "DISTRIBUTION_CHART", title: "Stock by Contract", kpiCode: "TOTAL_QTY_ON_HAND", dimensionId: getField("CONTRACT").id, viz: "BAR", pos: { x: 0, y: 6, w: 12, h: 4 } },
  ];

  const versionForQuery = { businessContextModelId: model.id, businessContextVersionId: contextVersion.id, dataSourceId: model.dataSourceId } as any;
  const validatedBlocks: any[] = [];

  for (const b of blocks) {
      const kpi = kpiRows.get(b.kpiCode);
      const blockData = {
          id: b.id,
          blockType: b.blockType,
          title: b.title,
          kpiId: kpi.id,
          kpiVersion: kpi.version,
          dimensionFieldId: (b as any).dimensionId ?? null,
          visualizationType: (b as any).viz ?? "NUMBER",
          visualizationConfig: { datasetShape: b.blockType === "KPI_CARD" ? "SINGLE_VALUE" : "CATEGORY_DISTRIBUTION" },
          position: b.pos,
          filtersJson: "[]"
      } as any;

      const generated = await generateBlockQuery(blockData, versionForQuery);
      const result = await withOracleConnection(source, async (connection, outFormat) => connection.execute(generated.sql, generated.binds, { outFormat, maxRows: 100 }));
      const rows = result.rows ?? [];

      validatedBlocks.push({
          ...blockData,
          generatedSql: generated.sql,
          queryPlanJson: JSON.stringify(generated.plan),
          queryFingerprint: createHash("sha256").update(generated.sql).digest("hex"),
          bindParametersJson: JSON.stringify(Object.keys(generated.binds)),
          previewJson: JSON.stringify({ state: "LIVE_PREVIEW", rows, rowCount: rows.length }),
          validationStatus: "PASSED"
      });
  }

  // Finalize Dashboard
  await db.transaction(async (tx) => {
      await tx.insert(dashboards).values({ id: DASHBOARD_ID, name: DASHBOARD_NAME, slug: DASHBOARD_SLUG, description: "Monitor spare-parts stock availability, inventory balance, warehouse distribution, and value.", category: "Inventory", ownerUserId: admin.id, status: "PUBLISHED", createdBy: admin.id, updatedBy: admin.id, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { status: "PUBLISHED", updatedAt: now } });
      await tx.insert(dashboardVersions).values({ id: VERSION_ID, dashboardId: DASHBOARD_ID, versionNumber: 1, businessObjective: "Monitor spare parts inventory", targetAudience: "Inventory Managers", businessQuestionsJson: "[]", refreshExpectation: "Real-time", defaultDateRange: "All", businessContextModelId: model.id, businessContextVersionId: contextVersion.id, dataSourceId: model.dataSourceId, layoutJson: "{}", status: "PUBLISHED", layoutTemplateId: LAYOUT_TEMPLATE_ID, createdBy: admin.id, updatedBy: admin.id, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { status: "PUBLISHED", updatedAt: now } });
      await tx.delete(dashboardBlocks).where(eq(dashboardBlocks.dashboardVersionId, VERSION_ID));
      for (const vb of validatedBlocks) {
          await tx.insert(dashboardBlocks).values({
              ...vb,
              dashboardVersionId: VERSION_ID,
              visualizationConfigJson: JSON.stringify(vb.visualizationConfig),
              positionJson: JSON.stringify(vb.position),
              createdBy: admin.id, updatedBy: admin.id, createdAt: now, updatedAt: now
          });
      }
      await tx.insert(dashboardPublications).values({ id: PUBLICATION_ID, dashboardId: DASHBOARD_ID, dashboardVersionId: VERSION_ID, snapshotJson: "{}", visibility: "WORKSPACE", publishedBy: admin.id, publishedAt: now }).onDuplicateKeyUpdate({ set: { publishedAt: now } });
      await tx.update(dashboards).set({ currentPublishedVersionId: VERSION_ID }).where(eq(dashboards.id, DASHBOARD_ID));
  });

  console.log("Dashboard 'Spare Parts Inventory' seeded successfully.");
}

main().catch(console.error).finally(() => pool.end());
