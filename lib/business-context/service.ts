import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiBusinessContextRecommendations, businessContextModels, businessContextModelVersions, businessContextReviewActions, businessContextReviewRequests,
  businessDomains, businessFields, businessGlossaryTerms, businessObjects, businessRelationships, businessSynonyms,
  dataSourceColumns, dataSources, dataSourceTables, kpiDefinitions, kpiFilters, kpiFormulaNodes, kpiSourceFields, kpiThresholds, kpiValidationResults,
  type Role,
} from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { requireBusinessContextPermission, assertEditable, maySeePhysicalMetadata } from "./permissions";
import { collectFormulaFieldIds, type FormulaNode } from "./formula";

type Model = typeof businessContextModels.$inferSelect;
const now = () => new Date();
const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> { const copy: Partial<T> = { ...value }; for (const key of keys) delete copy[key]; return copy as Omit<T, K>; }

const defaultDomains = [
  ["PROCUREMENT", "Procurement", "จัดซื้อ"], ["INVENTORY", "Inventory", "สินค้าคงคลัง"], ["MAINTENANCE", "Maintenance", "ซ่อมบำรุง"], ["FLEET", "Fleet", "กองยาน"], ["FINANCE", "Finance", "การเงิน"], ["OTHER", "Other", "อื่น ๆ"],
] as const;

export async function requireModel(id: string) {
  const model = (await db.select().from(businessContextModels).where(and(eq(businessContextModels.id, id), isNull(businessContextModels.deletedAt))).limit(1))[0];
  if (!model) throw new HttpError(404, "Business Context Model not found", "NOT_FOUND");
  return model;
}

export async function listBusinessContextModels(user: AuthenticatedUser, input: { q?: string; status?: string; dataSourceId?: string; page: number; pageSize: number }) {
  if (user.role === "VIEWER") return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
  const filters = [isNull(businessContextModels.deletedAt)];
  if (input.q) filters.push(or(like(businessContextModels.name, `%${input.q}%`), like(businessContextModels.schemaName, `%${input.q}%`))!);
  if (input.dataSourceId) filters.push(eq(businessContextModels.dataSourceId, input.dataSourceId));
  if (input.status && ["DRAFT", "AI_ANALYZING", "READY_FOR_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "ARCHIVED"].includes(input.status)) filters.push(eq(businessContextModels.status, input.status as Model["status"]));
  if (user.role === "DASHBOARD_CREATOR") filters.push(eq(businessContextModels.status, "PUBLISHED"));
  const rows = await db.select({ model: businessContextModels, dataSourceName: dataSources.name, databaseType: dataSources.databaseType }).from(businessContextModels).innerJoin(dataSources, eq(dataSources.id, businessContextModels.dataSourceId)).where(and(...filters)).orderBy(desc(businessContextModels.updatedAt));
  const accessible = [];
  for (const row of rows) {
    try { await requireBusinessContextPermission(user, row.model.dataSourceId, "BUSINESS_CONTEXT_VIEW"); accessible.push(row); } catch { /* inaccessible sources stay undiscoverable */ }
  }
  const start = (input.page - 1) * input.pageSize;
  const items = [];
  for (const row of accessible.slice(start, start + input.pageSize)) {
    const [objects, fields, relationships, kpis] = await Promise.all([
      db.select({ id: businessObjects.id }).from(businessObjects).where(and(eq(businessObjects.modelId, row.model.id), isNull(businessObjects.deletedAt))),
      db.select({ id: businessFields.id }).from(businessFields).where(and(eq(businessFields.modelId, row.model.id), isNull(businessFields.deletedAt))),
      db.select({ id: businessRelationships.id }).from(businessRelationships).where(and(eq(businessRelationships.modelId, row.model.id), isNull(businessRelationships.deletedAt))),
      db.select({ id: kpiDefinitions.id }).from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, row.model.id), isNull(kpiDefinitions.deletedAt))),
    ]);
    items.push({ ...row.model, dataSourceName: row.dataSourceName, databaseType: row.databaseType, objectCount: objects.length, fieldCount: fields.length, relationshipCount: relationships.length, kpiCount: kpis.length });
  }
  return { items, total: accessible.length, page: input.page, pageSize: input.pageSize };
}

export async function createBusinessContextModel(input: { dataSourceId: string; name: string; description?: string; schemaName: string }, user: AuthenticatedUser) {
  await requireBusinessContextPermission(user, input.dataSourceId, "BUSINESS_CONTEXT_CREATE");
  const source = (await db.select({ id: dataSources.id }).from(dataSources).where(eq(dataSources.id, input.dataSourceId)).limit(1))[0];
  if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND");
  const timestamp = now(); const id = randomUUID();
  await db.insert(businessContextModels).values({ id, ...input, schemaName: input.schemaName.toUpperCase(), createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp });
  await db.insert(businessDomains).values(defaultDomains.map(([code, name, nameTh]) => ({ id: randomUUID(), dataSourceId: input.dataSourceId, modelId: id, code, name, nameTh, status: "APPROVED" as const, createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp })));
  return requireModel(id);
}

export async function updateBusinessContextModel(id: string, changes: { name?: string; description?: string | null; schemaName?: string }, user: AuthenticatedUser) {
  const model = await requireModel(id); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_CONTEXT_UPDATE"); assertEditable(model.status);
  await db.update(businessContextModels).set({ ...changes, schemaName: changes.schemaName?.toUpperCase(), version: model.version + 1, updatedBy: user.id, updatedAt: now() }).where(eq(businessContextModels.id, id));
  return requireModel(id);
}

function inferField(column: typeof dataSourceColumns.$inferSelect) {
  const name = column.columnName.toUpperCase(); const type = column.dataType.toUpperCase(); const numeric = /NUMBER|FLOAT|DECIMAL|INT/.test(type); const date = /DATE|TIMESTAMP/.test(type);
  const technical = ["ROWKEY", "ROWVERSION", "OBJID", "OBJVERSION"].includes(name);
  const sensitive = column.sensitivityType !== "NONE";
  const role = technical ? "TECHNICAL_FIELD" : sensitive ? "SENSITIVE_FIELD" : column.isPrimaryKey ? "IDENTIFIER" : column.isForeignKey ? "FOREIGN_KEY" : date ? "DATE_DIMENSION" : numeric ? "MEASURE" : /STATE|STATUS/.test(name) ? "STATUS_DIMENSION" : "DIMENSION";
  const businessType = date ? (type.includes("TIMESTAMP") ? "DATETIME" : "DATE") : numeric ? "NUMBER" : /STATE|STATUS/.test(name) ? "STATUS" : column.isPrimaryKey || column.isForeignKey ? "IDENTIFIER" : "TEXT";
  return { businessName: name.toLowerCase().split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" "), businessType, fieldRole: role, aggregationRule: role === "MEASURE" ? "SUM" : "NONE", sensitivityClassification: column.sensitivityType, aiUsageAllowed: !technical && !sensitive, visibleToDashboardCreator: !technical && !sensitive } as const;
}

export async function createBusinessObject(modelId: string, input: { physicalTableId: string; businessName: string; shortName?: string; description?: string; businessDomainId?: string; objectType?: typeof businessObjects.$inferInsert.objectType; recordGrain?: string; dataOwner?: string; dataSteward?: string; tags?: string[]; sensitivityLevel?: typeof businessObjects.$inferInsert.sensitivityLevel; aiUsageAllowed?: boolean; notes?: string; mapFields?: boolean }, user: AuthenticatedUser) {
  const model = await requireModel(modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_OBJECT_MANAGE"); assertEditable(model.status);
  const table = (await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.id, input.physicalTableId), eq(dataSourceTables.dataSourceId, model.dataSourceId))).limit(1))[0];
  if (!table || table.schemaName !== model.schemaName) throw new HttpError(400, "Physical object does not belong to the model data source and schema", "SCOPE_MISMATCH");
  if (input.businessDomainId) { const domain = (await db.select().from(businessDomains).where(and(eq(businessDomains.id, input.businessDomainId), eq(businessDomains.modelId, modelId))).limit(1))[0]; if (!domain) throw new HttpError(400, "Business domain is outside the model", "SCOPE_MISMATCH"); }
  const timestamp = now(); const id = randomUUID();
  await db.insert(businessObjects).values({ id, modelId, dataSourceId: model.dataSourceId, physicalTableId: table.id, technicalName: table.tableName, databaseSchema: table.schemaName, businessName: input.businessName, shortName: input.shortName, description: input.description, businessDomainId: input.businessDomainId, objectType: input.objectType ?? (table.objectType === "VIEW" ? "VIEW" : "UNKNOWN"), recordGrain: input.recordGrain, dataOwner: input.dataOwner, dataSteward: input.dataSteward, tags: json(input.tags ?? []), sensitivityLevel: input.sensitivityLevel ?? "INTERNAL", aiUsageAllowed: input.aiUsageAllowed ?? false, notes: input.notes, createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp });
  if (input.mapFields !== false) {
    const columns = await db.select().from(dataSourceColumns).where(eq(dataSourceColumns.tableId, table.id)).orderBy(asc(dataSourceColumns.ordinalPosition));
    if (columns.length) await db.insert(businessFields).values(columns.map((column) => ({ id: randomUUID(), modelId, dataSourceId: model.dataSourceId, businessObjectId: id, physicalColumnId: column.id, physicalColumnName: column.columnName, physicalDataType: column.dataType, nullable: column.nullable, isPrimaryKey: column.isPrimaryKey, isForeignKey: column.isForeignKey, ...inferField(column), createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp })));
  }
  return (await db.select().from(businessObjects).where(eq(businessObjects.id, id)).limit(1))[0];
}

export async function updateBusinessObject(id: string, changes: Partial<typeof businessObjects.$inferInsert>, user: AuthenticatedUser) {
  const item = (await db.select().from(businessObjects).where(and(eq(businessObjects.id, id), isNull(businessObjects.deletedAt))).limit(1))[0]; if (!item) throw new HttpError(404, "Business Object not found", "NOT_FOUND");
  const model = await requireModel(item.modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_OBJECT_MANAGE"); assertEditable(model.status);
  const allowed = (({ businessName, shortName, description, businessDomainId, objectType, primaryKeyDefinition, defaultDateFieldId, recordGrain, dataOwner, dataSteward, tags, sensitivityLevel, usageStatus, aiUsageAllowed, approvalStatus, notes, layoutX, layoutY }) => ({ businessName, shortName, description, businessDomainId, objectType, primaryKeyDefinition, defaultDateFieldId, recordGrain, dataOwner, dataSteward, tags, sensitivityLevel, usageStatus, aiUsageAllowed, approvalStatus, notes, layoutX, layoutY }))(changes);
  await db.update(businessObjects).set({ ...allowed, version: item.version + 1, updatedBy: user.id, updatedAt: now() }).where(eq(businessObjects.id, id));
  return (await db.select().from(businessObjects).where(eq(businessObjects.id, id)).limit(1))[0];
}

export async function getBusinessObject(id: string, user: AuthenticatedUser) {
  const item = (await db.select().from(businessObjects).where(and(eq(businessObjects.id, id), isNull(businessObjects.deletedAt))).limit(1))[0]; if (!item) throw new HttpError(404, "Business Object not found", "NOT_FOUND"); await requireBusinessContextPermission(user, item.dataSourceId, "BUSINESS_OBJECT_VIEW"); if (!maySeePhysicalMetadata(user)) { if (item.approvalStatus !== "APPROVED") throw new HttpError(404, "Business Object not found", "NOT_FOUND"); return omit(item, ["technicalName", "databaseSchema", "physicalTableId", "primaryKeyDefinition"] as const); } return item;
}

export async function listBusinessObjectFields(objectId: string, user: AuthenticatedUser) {
  await getBusinessObject(objectId, user); const rows = await db.select().from(businessFields).where(and(eq(businessFields.businessObjectId, objectId), isNull(businessFields.deletedAt))).orderBy(asc(businessFields.businessName)); if (maySeePhysicalMetadata(user)) return rows.map((item) => omit(item, ["exampleValues"] as const)); return rows.filter((item) => item.approvalStatus === "APPROVED" && item.visibleToDashboardCreator).map((item) => omit(item, ["physicalColumnName", "physicalColumnId", "physicalDataType", "exampleValues"] as const));
}

export async function createBusinessField(objectId: string, input: { physicalColumnId: string; businessName: string; description?: string; businessType?: typeof businessFields.$inferInsert.businessType; fieldRole?: typeof businessFields.$inferInsert.fieldRole; aggregationRule?: typeof businessFields.$inferInsert.aggregationRule }, user: AuthenticatedUser) {
  const object = (await db.select().from(businessObjects).where(and(eq(businessObjects.id, objectId), isNull(businessObjects.deletedAt))).limit(1))[0]; if (!object) throw new HttpError(404, "Business Object not found", "NOT_FOUND"); const model = await requireModel(object.modelId); await requireBusinessContextPermission(user, object.dataSourceId, "BUSINESS_FIELD_MANAGE"); assertEditable(model.status); const column = (await db.select().from(dataSourceColumns).where(eq(dataSourceColumns.id, input.physicalColumnId)).limit(1))[0]; const table = (await db.select().from(dataSourceTables).where(eq(dataSourceTables.id, object.physicalTableId)).limit(1))[0]; if (!column || !table || column.tableId !== table.id) throw new HttpError(400, "Physical column does not belong to the Business Object", "SCOPE_MISMATCH"); const timestamp = now(); const id = randomUUID(); const overrides = omit(input, ["physicalColumnId"] as const); await db.insert(businessFields).values({ id, modelId: object.modelId, dataSourceId: object.dataSourceId, businessObjectId: object.id, physicalColumnId: column.id, physicalColumnName: column.columnName, physicalDataType: column.dataType, nullable: column.nullable, isPrimaryKey: column.isPrimaryKey, isForeignKey: column.isForeignKey, ...inferField(column), ...overrides, createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp }); return (await db.select().from(businessFields).where(eq(businessFields.id, id)).limit(1))[0];
}

export async function updateBusinessField(id: string, changes: Partial<typeof businessFields.$inferInsert>, user: AuthenticatedUser) {
  const item = (await db.select().from(businessFields).where(and(eq(businessFields.id, id), isNull(businessFields.deletedAt))).limit(1))[0]; if (!item) throw new HttpError(404, "Business Field not found", "NOT_FOUND");
  const model = await requireModel(item.modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_FIELD_MANAGE"); assertEditable(model.status);
  if (changes.sensitivityClassification && changes.sensitivityClassification !== "NONE" && changes.aiUsageAllowed) throw new HttpError(400, "Sensitive fields cannot be AI-enabled", "SENSITIVE_AI_FIELD");
  const disallowedSum = ["TEXT", "STATUS", "IDENTIFIER", "EMAIL", "PHONE", "URL", "BOOLEAN", "DATE", "DATETIME"];
  const type = changes.businessType ?? item.businessType; const aggregate = changes.aggregationRule ?? item.aggregationRule; const role = changes.fieldRole ?? item.fieldRole;
  if (["SUM", "AVERAGE"].includes(aggregate) && (disallowedSum.includes(type) || role === "IDENTIFIER")) throw new HttpError(400, `${aggregate} is invalid for ${type}`, "INVALID_AGGREGATION");
  if (role === "IGNORED" && changes.visibleToDashboardCreator) throw new HttpError(400, "Ignored fields cannot be visible to Dashboard Creator", "INVALID_VISIBILITY");
  const allowed = (({ businessName, description, businessType, fieldRole, aggregationRule, format, unit, currency, timeZone, dimensionGroup, sensitivityClassification, maskingRule, aiUsageAllowed, filterable, groupable, sortable, searchable, visibleToDashboardCreator, approvalStatus }) => ({ businessName, description, businessType, fieldRole, aggregationRule, format, unit, currency, timeZone, dimensionGroup, sensitivityClassification, maskingRule, aiUsageAllowed, filterable, groupable, sortable, searchable, visibleToDashboardCreator, approvalStatus }))(changes);
  await db.update(businessFields).set({ ...allowed, version: item.version + 1, updatedBy: user.id, updatedAt: now() }).where(eq(businessFields.id, id));
  return (await db.select().from(businessFields).where(eq(businessFields.id, id)).limit(1))[0];
}

export async function createBusinessRelationship(modelId: string, input: { sourceObjectId: string; sourceFieldId: string; targetObjectId: string; targetFieldId: string; joinType: "INNER" | "LEFT" | "RIGHT"; cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY" | "UNKNOWN"; direction?: "BIDIRECTIONAL" | "SOURCE_TO_TARGET" | "TARGET_TO_SOURCE"; isRequired?: boolean; confidenceScore?: number; sourceType?: "DATABASE_CONSTRAINT" | "AI_SUGGESTED" | "MANUAL" | "COLUMN_PATTERN"; notes?: string }, user: AuthenticatedUser) {
  const model = await requireModel(modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_RELATIONSHIP_MANAGE"); assertEditable(model.status);
  const objects = await db.select().from(businessObjects).where(inArray(businessObjects.id, [input.sourceObjectId, input.targetObjectId]));
  const fields = await db.select().from(businessFields).where(inArray(businessFields.id, [input.sourceFieldId, input.targetFieldId]));
  if (objects.length !== 2 || fields.length !== 2 || objects.some((item) => item.modelId !== modelId || item.dataSourceId !== model.dataSourceId) || fields.some((item) => item.modelId !== modelId || item.dataSourceId !== model.dataSourceId)) throw new HttpError(400, "Relationship endpoints must belong to this model and data source", "SCOPE_MISMATCH");
  if (!fields.some((field) => field.id === input.sourceFieldId && field.businessObjectId === input.sourceObjectId) || !fields.some((field) => field.id === input.targetFieldId && field.businessObjectId === input.targetObjectId)) throw new HttpError(400, "Relationship field does not belong to its object", "SCOPE_MISMATCH");
  const timestamp = now(); const id = randomUUID();
  await db.insert(businessRelationships).values({ id, modelId, dataSourceId: model.dataSourceId, ...input, direction: input.direction ?? "SOURCE_TO_TARGET", isRequired: input.isRequired ?? false, confidenceScore: input.confidenceScore ?? 100, sourceType: input.sourceType ?? "MANUAL", createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp });
  return (await db.select().from(businessRelationships).where(eq(businessRelationships.id, id)).limit(1))[0];
}

export async function getBusinessContextWorkspace(id: string, user: AuthenticatedUser) {
  const model = await requireModel(id); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_CONTEXT_VIEW");
  if (user.role === "DASHBOARD_CREATOR" && model.status !== "PUBLISHED") throw new HttpError(404, "Business Context Model not found", "NOT_FOUND");
  const [domains, objects, fields, relationships, kpis, recommendations, versions, glossary, reviews] = await Promise.all([
    db.select().from(businessDomains).where(and(eq(businessDomains.modelId, id), isNull(businessDomains.deletedAt))).orderBy(asc(businessDomains.name)),
    db.select().from(businessObjects).where(and(eq(businessObjects.modelId, id), isNull(businessObjects.deletedAt))).orderBy(asc(businessObjects.businessName)),
    db.select().from(businessFields).where(and(eq(businessFields.modelId, id), isNull(businessFields.deletedAt))).orderBy(asc(businessFields.businessName)),
    db.select().from(businessRelationships).where(and(eq(businessRelationships.modelId, id), isNull(businessRelationships.deletedAt))),
    db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, id), isNull(kpiDefinitions.deletedAt))).orderBy(asc(kpiDefinitions.name)),
    db.select().from(aiBusinessContextRecommendations).where(and(eq(aiBusinessContextRecommendations.modelId, id), isNull(aiBusinessContextRecommendations.deletedAt))).orderBy(desc(aiBusinessContextRecommendations.createdAt)),
    db.select().from(businessContextModelVersions).where(and(eq(businessContextModelVersions.modelId, id), isNull(businessContextModelVersions.deletedAt))).orderBy(desc(businessContextModelVersions.versionNumber)),
    db.select().from(businessGlossaryTerms).where(and(eq(businessGlossaryTerms.modelId, id), isNull(businessGlossaryTerms.deletedAt))).orderBy(asc(businessGlossaryTerms.term)),
    db.select().from(businessContextReviewRequests).where(and(eq(businessContextReviewRequests.modelId, id), isNull(businessContextReviewRequests.deletedAt))).orderBy(desc(businessContextReviewRequests.requestedAt)),
  ]);
  if (maySeePhysicalMetadata(user)) return { model, domains, objects, fields: fields.map((field) => ({ ...field, exampleValues: undefined })), relationships, kpis, recommendations, versions, glossary, reviews };
  return { model, domains, objects: objects.filter((item) => item.approvalStatus === "APPROVED").map((item) => omit(item, ["technicalName", "databaseSchema", "physicalTableId", "primaryKeyDefinition"] as const)), fields: fields.filter((item) => item.approvalStatus === "APPROVED" && item.visibleToDashboardCreator).map((item) => omit(item, ["physicalColumnName", "physicalColumnId", "physicalDataType", "exampleValues"] as const)), relationships: relationships.filter((item) => item.approvalStatus === "APPROVED"), kpis: kpis.filter((item) => ["APPROVED", "CERTIFIED"].includes(item.status)).map((item) => omit(item, ["formulaAst"] as const)), recommendations: [], versions: versions.map((item) => omit(item, ["objectsSnapshot", "fieldsSnapshot", "relationshipsSnapshot", "kpisSnapshot", "glossarySnapshot"] as const)), glossary: glossary.filter((item) => item.approvalStatus === "APPROVED"), reviews: [] };
}

export async function createKpi(input: { modelId: string; code: string; name: string; shortName?: string; description?: string; businessObjective?: string; businessQuestion?: string; businessDomainId?: string; owner?: string; dataSteward?: string; tags?: string[]; measureType: "ADDITIVE" | "SEMI_ADDITIVE" | "NON_ADDITIVE" | "RATIO" | "COUNT"; formulaAst: FormulaNode; nullHandling: "ZERO" | "IGNORE" | "ERROR"; divisionByZeroHandling: "NULL" | "ZERO" | "ERROR"; decimalPrecision: number; unit?: string; currency?: string; defaultDateFieldId?: string; dateLogic?: unknown; recommendedVisualization?: string; displayFormat?: string }, user: AuthenticatedUser) {
  const model = await requireModel(input.modelId); await requireBusinessContextPermission(user, model.dataSourceId, "KPI_CREATE"); assertEditable(model.status);
  const fieldIds = [...collectFormulaFieldIds(input.formulaAst)]; const fields = fieldIds.length ? await db.select().from(businessFields).where(inArray(businessFields.id, fieldIds)) : [];
  if (fields.length !== fieldIds.length || fields.some((field) => field.modelId !== model.id || field.dataSourceId !== model.dataSourceId)) throw new HttpError(400, "KPI formula contains fields outside the model", "SCOPE_MISMATCH");
  const timestamp = now(); const id = randomUUID();
  await db.insert(kpiDefinitions).values({ id, modelId: model.id, dataSourceId: model.dataSourceId, businessDomainId: input.businessDomainId, code: input.code, name: input.name, shortName: input.shortName, description: input.description, businessObjective: input.businessObjective, businessQuestion: input.businessQuestion, owner: input.owner, dataSteward: input.dataSteward, tags: json(input.tags ?? []), measureType: input.measureType, formulaAst: json(input.formulaAst), nullHandling: input.nullHandling, divisionByZeroHandling: input.divisionByZeroHandling, decimalPrecision: input.decimalPrecision, unit: input.unit, currency: input.currency, defaultDateFieldId: input.defaultDateFieldId, dateLogic: input.dateLogic ? json(input.dateLogic) : undefined, recommendedVisualization: input.recommendedVisualization, displayFormat: input.displayFormat, draftedBy: user.id, createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp });
  if (fields.length) await db.insert(kpiSourceFields).values(fields.map((field) => ({ id: randomUUID(), kpiId: id, businessObjectId: field.businessObjectId, businessFieldId: field.id, role: field.id === input.defaultDateFieldId ? "DATE" as const : field.fieldRole === "MEASURE" ? "MEASURE" as const : "DIMENSION" as const, createdBy: user.id, createdAt: timestamp })));
  await persistFormulaNodes(id, input.formulaAst, user.id, timestamp);
  return getKpi(id, user);
}

async function persistFormulaNodes(kpiId: string, root: FormulaNode, userId: string, timestamp: Date) {
  const rows: Array<typeof kpiFormulaNodes.$inferInsert> = [];
  const walk = (node: FormulaNode, parentNodeId: string | null, sortOrder: number) => {
    const id = randomUUID();
    const operator = "operator" in node ? node.operator : "function" in node ? node.function : undefined;
    rows.push({ id, kpiId, parentNodeId, nodeType: node.type, operator, businessFieldId: node.type === "field" ? node.businessFieldId : undefined, literalValue: node.type === "literal" ? json(node.value) : undefined, config: json(Object.fromEntries(Object.entries(node).filter(([key]) => !["type", "left", "right", "expression", "numerator", "denominator", "whenTrue", "whenFalse", "start", "end", "current", "comparison", "arguments"].includes(key)))), sortOrder, createdBy: userId, updatedBy: userId, createdAt: timestamp, updatedAt: timestamp });
    const children: FormulaNode[] = [];
    if (node.type === "arithmetic") children.push(node.left, node.right); else if (node.type === "aggregate" || node.type === "period") children.push(node.expression); else if (node.type === "ratio" || node.type === "percentage") children.push(node.numerator, node.denominator); else if (node.type === "conditional") children.push(node.condition.left, node.condition.right, node.whenTrue, node.whenFalse); else if (node.type === "date_difference") children.push(node.start, node.end); else if (node.type === "growth_rate" || node.type === "variance") children.push(node.current, node.comparison); else if (node.type === "custom") children.push(...node.arguments);
    children.forEach((child, index) => walk(child, id, index));
  };
  walk(root, null, 0); if (rows.length) await db.insert(kpiFormulaNodes).values(rows);
}

export async function getKpi(id: string, user: AuthenticatedUser) {
  const kpi = (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.id, id), isNull(kpiDefinitions.deletedAt))).limit(1))[0]; if (!kpi) throw new HttpError(404, "KPI not found", "NOT_FOUND");
  await requireBusinessContextPermission(user, kpi.dataSourceId, "KPI_VIEW"); if ((user.role === "DASHBOARD_CREATOR" || user.role === "VIEWER") && !["APPROVED", "CERTIFIED"].includes(kpi.status)) throw new HttpError(404, "KPI not found", "NOT_FOUND");
  const [sourceFields, filters, thresholds] = await Promise.all([db.select().from(kpiSourceFields).where(and(eq(kpiSourceFields.kpiId, id), isNull(kpiSourceFields.deletedAt))), db.select().from(kpiFilters).where(and(eq(kpiFilters.kpiId, id), isNull(kpiFilters.deletedAt))), db.select().from(kpiThresholds).where(and(eq(kpiThresholds.kpiId, id), isNull(kpiThresholds.deletedAt)))]);
  if (maySeePhysicalMetadata(user)) return { ...kpi, formulaAst: parseJson<FormulaNode | null>(kpi.formulaAst, null), sourceFields, filters, thresholds };
  const publicKpi = omit(kpi, ["formulaAst", "dataSourceId"] as const); return { ...publicKpi, sourceFields: [], filters: [], thresholds };
}

export async function listKpis(user: AuthenticatedUser, input: { q?: string; modelId?: string; status?: string }) {
  const filters = [isNull(kpiDefinitions.deletedAt)]; if (input.q) filters.push(or(like(kpiDefinitions.name, `%${input.q}%`), like(kpiDefinitions.code, `%${input.q}%`), like(kpiDefinitions.description, `%${input.q}%`))!); if (input.modelId) filters.push(eq(kpiDefinitions.modelId, input.modelId));
  if (input.status && kpiDefinitions.status.enumValues.includes(input.status as never)) filters.push(eq(kpiDefinitions.status, input.status as typeof kpiDefinitions.$inferSelect.status));
  if (user.role === "DASHBOARD_CREATOR" || user.role === "VIEWER") filters.push(inArray(kpiDefinitions.status, ["APPROVED", "CERTIFIED"]));
  const rows = await db.select().from(kpiDefinitions).where(and(...filters)).orderBy(asc(kpiDefinitions.name));
  return maySeePhysicalMetadata(user) ? rows : rows.map((item) => omit(item, ["formulaAst", "dataSourceId"] as const));
}

async function snapshotModel(model: Model) {
  const [objects, fields, relationships, kpis, glossary] = await Promise.all([
    db.select().from(businessObjects).where(and(eq(businessObjects.modelId, model.id), isNull(businessObjects.deletedAt))), db.select().from(businessFields).where(and(eq(businessFields.modelId, model.id), isNull(businessFields.deletedAt))), db.select().from(businessRelationships).where(and(eq(businessRelationships.modelId, model.id), isNull(businessRelationships.deletedAt))), db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, model.id), isNull(kpiDefinitions.deletedAt))), db.select().from(businessGlossaryTerms).where(and(eq(businessGlossaryTerms.modelId, model.id), isNull(businessGlossaryTerms.deletedAt))),
  ]); return { objects, fields, relationships, kpis, glossary };
}

export async function transitionModel(id: string, action: "SUBMIT" | "APPROVE" | "PUBLISH" | "CREATE_VERSION" | "ROLLBACK" | "ARCHIVE", user: AuthenticatedUser, changeSummary?: string, sourceVersionId?: string) {
  const model = await requireModel(id); const permission = action === "PUBLISH" ? "BUSINESS_CONTEXT_PUBLISH" : action === "APPROVE" ? "BUSINESS_CONTEXT_APPROVE" : action === "ROLLBACK" ? "BUSINESS_CONTEXT_ROLLBACK" : "BUSINESS_CONTEXT_UPDATE";
  await requireBusinessContextPermission(user, model.dataSourceId, permission);
  const timestamp = now();
  if (action === "SUBMIT") {
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(model.status)) throw new HttpError(409, "Only a draft can be submitted", "INVALID_WORKFLOW_STATE");
    const validation = await validateModel(id, user);
    if (validation.outcome === "FAILED") throw new HttpError(409, "Business Context Model must pass validation before review", "VALIDATION_REQUIRED");
    await db.insert(businessContextReviewRequests).values({ id: randomUUID(), modelId: id, reviewStage: "DATA_STEWARD_REVIEW", requestedBy: user.id, requestedAt: timestamp, createdAt: timestamp, updatedAt: timestamp });
    await db.update(businessContextModels).set({ status: "READY_FOR_REVIEW", submittedAt: timestamp, submittedBy: user.id, updatedAt: timestamp, updatedBy: user.id }).where(eq(businessContextModels.id, id));
  } else if (action === "APPROVE") {
    if (model.status !== "READY_FOR_REVIEW") throw new HttpError(409, "Model must be ready for review", "INVALID_WORKFLOW_STATE");
    const request = (await db.select().from(businessContextReviewRequests).where(and(eq(businessContextReviewRequests.modelId, id), eq(businessContextReviewRequests.status, "OPEN"))).orderBy(desc(businessContextReviewRequests.requestedAt)).limit(1))[0];
    if (request) { await db.update(businessContextReviewRequests).set({ status: "APPROVED", completedAt: timestamp, updatedAt: timestamp }).where(eq(businessContextReviewRequests.id, request.id)); await db.insert(businessContextReviewActions).values({ id: randomUUID(), reviewRequestId: request.id, action: "APPROVE", comment: changeSummary, modelVersion: model.version, reviewerId: user.id, actionAt: timestamp, createdAt: timestamp }); }
    await db.update(businessContextModels).set({ status: "APPROVED", approvedAt: timestamp, approvedBy: user.id, updatedAt: timestamp, updatedBy: user.id }).where(eq(businessContextModels.id, id));
  } else if (action === "PUBLISH") {
    if (model.status !== "APPROVED") throw new HttpError(409, "Only an approved model can be published", "INVALID_WORKFLOW_STATE");
    const snapshot = await snapshotModel(model); const previous = (await db.select().from(businessContextModelVersions).where(eq(businessContextModelVersions.modelId, id)).orderBy(desc(businessContextModelVersions.versionNumber)).limit(1))[0];
    await db.insert(businessContextModelVersions).values({ id: randomUUID(), modelId: id, parentVersionId: previous?.id, versionNumber: model.version, changeSummary, status: "PUBLISHED", objectsSnapshot: json(snapshot.objects), fieldsSnapshot: json(snapshot.fields), relationshipsSnapshot: json(snapshot.relationships), kpisSnapshot: json(snapshot.kpis), glossarySnapshot: json(snapshot.glossary), approvedBy: model.approvedBy, publishedBy: user.id, publishedAt: timestamp, createdBy: user.id, createdAt: timestamp });
    await db.update(businessContextModels).set({ status: "PUBLISHED", publishedAt: timestamp, publishedBy: user.id, updatedAt: timestamp, updatedBy: user.id }).where(eq(businessContextModels.id, id));
  } else if (action === "CREATE_VERSION") {
    if (model.status !== "PUBLISHED") throw new HttpError(409, "Create a new version from a published model", "INVALID_WORKFLOW_STATE");
    await db.update(businessContextModels).set({ status: "DRAFT", version: model.version + 1, submittedAt: null, submittedBy: null, approvedAt: null, approvedBy: null, publishedAt: null, publishedBy: null, updatedAt: timestamp, updatedBy: user.id }).where(eq(businessContextModels.id, id));
  } else if (action === "ROLLBACK") {
    const source = sourceVersionId ? (await db.select().from(businessContextModelVersions).where(and(eq(businessContextModelVersions.id, sourceVersionId), eq(businessContextModelVersions.modelId, id))).limit(1))[0] : undefined; if (!source) throw new HttpError(400, "A valid source version is required", "VALIDATION_ERROR");
    await db.insert(businessContextModelVersions).values({ id: randomUUID(), modelId: id, parentVersionId: source.id, versionNumber: model.version + 1, changeSummary: changeSummary ?? `Rollback based on version ${source.versionNumber}`, status: "PUBLISHED", objectsSnapshot: source.objectsSnapshot, fieldsSnapshot: source.fieldsSnapshot, relationshipsSnapshot: source.relationshipsSnapshot, kpisSnapshot: source.kpisSnapshot, glossarySnapshot: source.glossarySnapshot, approvedBy: user.id, publishedBy: user.id, publishedAt: timestamp, createdBy: user.id, createdAt: timestamp });
    await db.update(businessContextModels).set({ status: "PUBLISHED", version: model.version + 1, approvedAt: timestamp, approvedBy: user.id, publishedAt: timestamp, publishedBy: user.id, updatedAt: timestamp, updatedBy: user.id }).where(eq(businessContextModels.id, id));
  } else {
    await db.update(businessContextModels).set({ status: "ARCHIVED", deletedAt: timestamp, updatedAt: timestamp, updatedBy: user.id }).where(eq(businessContextModels.id, id));
  }
  return requireModel(id).catch(() => ({ ...model, status: "ARCHIVED" as const, deletedAt: timestamp }));
}

export async function createGlossaryTerm(input: { modelId: string; term: string; definition: string; abbreviations?: string[]; synonyms?: Array<{ value: string; language: "EN" | "TH" }>; language: "EN" | "TH"; businessDomainId?: string; businessObjectId?: string; businessFieldId?: string; kpiId?: string }, user: AuthenticatedUser) {
  const model = await requireModel(input.modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_GLOSSARY_MANAGE"); assertEditable(model.status); const timestamp = now(); const id = randomUUID();
  await db.insert(businessGlossaryTerms).values({ id, modelId: model.id, dataSourceId: model.dataSourceId, term: input.term, definition: input.definition, abbreviations: json(input.abbreviations ?? []), language: input.language, businessDomainId: input.businessDomainId, businessObjectId: input.businessObjectId, businessFieldId: input.businessFieldId, kpiId: input.kpiId, createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp });
  if (input.synonyms?.length) await db.insert(businessSynonyms).values(input.synonyms.map((item) => ({ id: randomUUID(), glossaryTermId: id, synonym: item.value, language: item.language, normalizedValue: normalizeSearch(item.value), createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp })));
  return (await db.select().from(businessGlossaryTerms).where(eq(businessGlossaryTerms.id, id)).limit(1))[0];
}

export async function listGlossary(user: AuthenticatedUser, input: { q?: string; modelId?: string; language?: "EN" | "TH" }) {
  const filters = [isNull(businessGlossaryTerms.deletedAt)]; if (input.q) filters.push(or(like(businessGlossaryTerms.term, `%${input.q}%`), like(businessGlossaryTerms.definition, `%${input.q}%`))!); if (input.modelId) filters.push(eq(businessGlossaryTerms.modelId, input.modelId)); if (input.language) filters.push(eq(businessGlossaryTerms.language, input.language)); if (user.role === "DASHBOARD_CREATOR" || user.role === "VIEWER") filters.push(eq(businessGlossaryTerms.approvalStatus, "APPROVED")); const rows = await db.select().from(businessGlossaryTerms).where(and(...filters)).orderBy(asc(businessGlossaryTerms.term)); if (user.role === "VIEWER") return rows.filter((item) => item.kpiId); const accessible = []; for (const item of rows) { if (!item.dataSourceId) continue; try { await requireBusinessContextPermission(user, item.dataSourceId, "BUSINESS_GLOSSARY_VIEW"); accessible.push(item); } catch { /* hidden */ } } return accessible;
}

export const normalizeSearch = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("th-TH").replace(/[\s_-]+/g, " ");
export async function searchBusinessContext(user: AuthenticatedUser, input: { q: string; dataSourceId?: string; approvalStatus?: string; certificationStatus?: string }) {
  const q = `%${input.q.trim()}%`; if (!input.q.trim()) return [];
  const [objects, fields, kpis, glossary, domains, synonyms] = await Promise.all([
    db.select().from(businessObjects).where(and(isNull(businessObjects.deletedAt), or(like(businessObjects.businessName, q), like(businessObjects.description, q)))),
    db.select().from(businessFields).where(and(isNull(businessFields.deletedAt), or(like(businessFields.businessName, q), like(businessFields.description, q)))),
    db.select().from(kpiDefinitions).where(and(isNull(kpiDefinitions.deletedAt), or(like(kpiDefinitions.name, q), like(kpiDefinitions.description, q), like(kpiDefinitions.code, q)))),
    db.select().from(businessGlossaryTerms).where(and(isNull(businessGlossaryTerms.deletedAt), or(like(businessGlossaryTerms.term, q), like(businessGlossaryTerms.definition, q)))),
    db.select().from(businessDomains).where(and(isNull(businessDomains.deletedAt), or(like(businessDomains.name, q), like(businessDomains.nameTh, q)))),
    db.select().from(businessSynonyms).where(and(isNull(businessSynonyms.deletedAt), like(businessSynonyms.normalizedValue, `%${normalizeSearch(input.q)}%`))),
  ]);
  const canPhysical = maySeePhysicalMetadata(user); const approvedOnly = user.role === "DASHBOARD_CREATOR" || user.role === "VIEWER";
  const candidateResults = [
    ...objects.filter((item) => (!input.dataSourceId || item.dataSourceId === input.dataSourceId) && (!approvedOnly || item.approvalStatus === "APPROVED")).map((item) => ({ id: item.id, name: item.businessName, type: "BUSINESS_OBJECT", description: item.description, dataSourceId: item.dataSourceId, approvalStatus: item.approvalStatus, matchReason: "Name or description", technicalName: canPhysical ? item.technicalName : undefined })),
    ...fields.filter((item) => (!input.dataSourceId || item.dataSourceId === input.dataSourceId) && (!approvedOnly || item.approvalStatus === "APPROVED" && item.visibleToDashboardCreator)).map((item) => ({ id: item.id, name: item.businessName, type: "BUSINESS_FIELD", description: item.description, dataSourceId: item.dataSourceId, approvalStatus: item.approvalStatus, matchReason: "Name or description", technicalName: canPhysical ? item.physicalColumnName : undefined })),
    ...kpis.filter((item) => (!input.dataSourceId || item.dataSourceId === input.dataSourceId) && (!approvedOnly || ["APPROVED", "CERTIFIED"].includes(item.status))).map((item) => ({ id: item.id, name: item.name, type: "KPI", description: item.description, dataSourceId: item.dataSourceId, approvalStatus: item.status, certificationStatus: item.certificationStatus, matchReason: "KPI name, code, or description" })),
    ...glossary.filter((item) => (!approvedOnly || item.approvalStatus === "APPROVED") && (user.role !== "VIEWER" || Boolean(item.kpiId))).map((item) => ({ id: item.id, name: item.term, type: "GLOSSARY_TERM", description: item.definition, dataSourceId: item.dataSourceId, approvalStatus: item.approvalStatus, matchReason: "Glossary term or definition" })),
    ...domains.filter((item) => !approvedOnly || item.status === "APPROVED").map((item) => ({ id: item.id, name: item.name, type: "BUSINESS_DOMAIN", description: item.description, dataSourceId: item.dataSourceId, approvalStatus: item.status, matchReason: "Business domain" })),
    ...synonyms.map((item) => ({ id: item.glossaryTermId ?? item.id, name: item.synonym, type: "SYNONYM", description: null, dataSourceId: null, approvalStatus: item.status, matchReason: "Thai/English synonym" })),
  ];
  const roleFiltered = user.role === "VIEWER" ? candidateResults.filter((item) => item.type === "KPI" || item.type === "GLOSSARY_TERM") : candidateResults;
  const allowedSources = new Set<string>();
  for (const sourceId of [...new Set(roleFiltered.map((item) => item.dataSourceId).filter((value): value is string => Boolean(value)))]) {
    if (user.role === "VIEWER") { allowedSources.add(sourceId); continue; }
    try { await requireBusinessContextPermission(user, sourceId, "BUSINESS_CONTEXT_VIEW"); allowedSources.add(sourceId); } catch { /* prevent cross-source discovery */ }
  }
  return roleFiltered.filter((item) => (!item.dataSourceId || allowedSources.has(item.dataSourceId)) && (!input.approvalStatus || item.approvalStatus === input.approvalStatus) && (!input.certificationStatus || !("certificationStatus" in item) || item.certificationStatus === input.certificationStatus)).slice(0, 100);
}

export const roleCanSelectKpiForDashboard = (role: Role, status: string) => (role === "ADMIN" || role === "DATA_SOURCE_CREATOR") ? ["APPROVED", "CERTIFIED"].includes(status) : role === "DASHBOARD_CREATOR" && ["APPROVED", "CERTIFIED"].includes(status);

export async function updateBusinessRelationship(id: string, changes: Partial<typeof businessRelationships.$inferInsert>, user: AuthenticatedUser) {
  const item = (await db.select().from(businessRelationships).where(and(eq(businessRelationships.id, id), isNull(businessRelationships.deletedAt))).limit(1))[0]; if (!item) throw new HttpError(404, "Relationship not found", "NOT_FOUND"); const model = await requireModel(item.modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_RELATIONSHIP_MANAGE"); assertEditable(model.status);
  const allowed = (({ joinType, cardinality, direction, isRequired, confidenceScore, sourceType, approvalStatus, notes }) => ({ joinType, cardinality, direction, isRequired, confidenceScore, sourceType, approvalStatus, notes }))(changes);
  await db.update(businessRelationships).set({ ...allowed, validationStatus: "PENDING", version: item.version + 1, updatedBy: user.id, updatedAt: now() }).where(eq(businessRelationships.id, id)); return (await db.select().from(businessRelationships).where(eq(businessRelationships.id, id)).limit(1))[0];
}

export async function updateKpi(id: string, changes: Partial<Omit<Parameters<typeof createKpi>[0], "modelId">> & { status?: typeof kpiDefinitions.$inferInsert.status }, user: AuthenticatedUser) {
  const item = (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.id, id), isNull(kpiDefinitions.deletedAt))).limit(1))[0]; if (!item) throw new HttpError(404, "KPI not found", "NOT_FOUND"); const model = await requireModel(item.modelId); await requireBusinessContextPermission(user, item.dataSourceId, "KPI_UPDATE"); assertEditable(model.status); const timestamp = now();
  let formulaFields: Array<typeof businessFields.$inferSelect> = [];
  if (changes.formulaAst) { const ids = [...collectFormulaFieldIds(changes.formulaAst)]; formulaFields = ids.length ? await db.select().from(businessFields).where(and(inArray(businessFields.id, ids), isNull(businessFields.deletedAt))) : []; if (formulaFields.length !== ids.length || formulaFields.some((field) => field.modelId !== item.modelId)) throw new HttpError(400, "KPI formula contains fields outside the model", "SCOPE_MISMATCH"); }
  const mapped = { ...changes, tags: changes.tags ? json(changes.tags) : undefined, formulaAst: changes.formulaAst ? json(changes.formulaAst) : undefined, dateLogic: changes.dateLogic ? json(changes.dateLogic) : undefined, divisionByZeroHandling: changes.divisionByZeroHandling };
  await db.update(kpiDefinitions).set({ ...mapped, version: item.version + 1, updatedBy: user.id, updatedAt: timestamp }).where(eq(kpiDefinitions.id, id));
  if (changes.formulaAst) { await db.update(kpiFormulaNodes).set({ deletedAt: timestamp, updatedAt: timestamp, updatedBy: user.id }).where(and(eq(kpiFormulaNodes.kpiId, id), isNull(kpiFormulaNodes.deletedAt))); await db.update(kpiSourceFields).set({ deletedAt: timestamp }).where(and(eq(kpiSourceFields.kpiId, id), isNull(kpiSourceFields.deletedAt))); if (formulaFields.length) await db.insert(kpiSourceFields).values(formulaFields.map((field) => ({ id: randomUUID(), kpiId: id, businessObjectId: field.businessObjectId, businessFieldId: field.id, role: field.id === changes.defaultDateFieldId ? "DATE" as const : field.fieldRole === "MEASURE" ? "MEASURE" as const : "DIMENSION" as const, createdBy: user.id, createdAt: timestamp }))); await persistFormulaNodes(id, changes.formulaAst, user.id, timestamp); }
  return getKpi(id, user);
}

export async function transitionKpi(id: string, action: "SUBMIT" | "APPROVE" | "CERTIFY", user: AuthenticatedUser, comment?: string) {
  const kpi = (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.id, id), isNull(kpiDefinitions.deletedAt))).limit(1))[0]; if (!kpi) throw new HttpError(404, "KPI not found", "NOT_FOUND"); const permission = action === "SUBMIT" ? "KPI_REVIEW" : action === "APPROVE" ? "KPI_APPROVE" : "KPI_CERTIFY"; await requireBusinessContextPermission(user, kpi.dataSourceId, permission); const model = await requireModel(kpi.modelId); assertEditable(model.status); const timestamp = now();
  if (action === "SUBMIT") { if (!["DRAFT", "CHANGES_REQUESTED"].includes(kpi.status)) throw new HttpError(409, "Only a KPI draft can be submitted", "INVALID_WORKFLOW_STATE"); const latest = (await db.select().from(kpiValidationResults).where(eq(kpiValidationResults.kpiId, id)).orderBy(desc(kpiValidationResults.validatedAt)).limit(1))[0]; if (!latest || latest.result === "FAILED") throw new HttpError(409, "KPI must pass validation before review", "VALIDATION_REQUIRED"); await db.insert(businessContextReviewRequests).values({ id: randomUUID(), modelId: kpi.modelId, kpiId: id, reviewStage: "BUSINESS_OWNER_REVIEW", requestedBy: user.id, requestedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }); await db.update(kpiDefinitions).set({ status: "UNDER_REVIEW", reviewedBy: user.id, updatedBy: user.id, updatedAt: timestamp }).where(eq(kpiDefinitions.id, id)); }
  if (action === "APPROVE") { if (kpi.status !== "UNDER_REVIEW") throw new HttpError(409, "KPI must be under review", "INVALID_WORKFLOW_STATE"); await db.update(kpiDefinitions).set({ status: "APPROVED", certificationStatus: "BUSINESS_VALIDATED", approvedBy: user.id, approvalDate: timestamp, updatedBy: user.id, updatedAt: timestamp }).where(eq(kpiDefinitions.id, id)); }
  if (action === "CERTIFY") { if (kpi.status !== "APPROVED") throw new HttpError(409, "Only an approved KPI can be certified", "INVALID_WORKFLOW_STATE"); await db.update(kpiDefinitions).set({ status: "CERTIFIED", certificationStatus: "CERTIFIED", approvedBy: user.id, approvalDate: timestamp, changeReason: comment, updatedBy: user.id, updatedAt: timestamp }).where(eq(kpiDefinitions.id, id)); }
  return getKpi(id, user);
}

export async function validateModel(id: string, user: AuthenticatedUser) {
  const model = await requireModel(id); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_CONTEXT_UPDATE"); const [objects, fields, relationships, kpis] = await Promise.all([db.select().from(businessObjects).where(and(eq(businessObjects.modelId, id), isNull(businessObjects.deletedAt))), db.select().from(businessFields).where(and(eq(businessFields.modelId, id), isNull(businessFields.deletedAt))), db.select().from(businessRelationships).where(and(eq(businessRelationships.modelId, id), isNull(businessRelationships.deletedAt))), db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, id), isNull(kpiDefinitions.deletedAt)))]); const issues: Array<{ code: string; severity: "WARNING" | "ERROR"; message: string; targetId?: string }> = [];
  if (!objects.length) issues.push({ code: "NO_OBJECTS", severity: "ERROR", message: "Map at least one physical table or view." }); objects.filter((item) => !item.recordGrain).forEach((item) => issues.push({ code: "MISSING_GRAIN", severity: "ERROR", message: `${item.businessName} has no record grain.`, targetId: item.id })); fields.filter((item) => item.fieldRole === "MEASURE" && item.aggregationRule === "NONE").forEach((item) => issues.push({ code: "MISSING_AGGREGATION", severity: "ERROR", message: `${item.businessName} is a measure without aggregation.`, targetId: item.id })); fields.filter((item) => item.sensitivityClassification !== "NONE" && item.aiUsageAllowed).forEach((item) => issues.push({ code: "SENSITIVE_AI", severity: "ERROR", message: `${item.businessName} is sensitive and AI-enabled.`, targetId: item.id })); relationships.filter((item) => item.validationStatus === "INVALID" || item.validationStatus === "PENDING").forEach((item) => issues.push({ code: "RELATIONSHIP_NOT_VALIDATED", severity: "WARNING", message: "A relationship has not passed validation.", targetId: item.id })); kpis.filter((item) => !["APPROVED", "CERTIFIED"].includes(item.status)).forEach((item) => issues.push({ code: "KPI_NOT_APPROVED", severity: "WARNING", message: `${item.name} is not approved and will not be available to dashboards.`, targetId: item.id })); return { outcome: issues.some((item) => item.severity === "ERROR") ? "FAILED" : issues.length ? "PASSED_WITH_WARNING" : "PASSED", issues };
}

export async function updateGlossaryTerm(id: string, changes: { term?: string; definition?: string; abbreviations?: string[]; language?: "EN" | "TH"; approvalStatus?: typeof businessGlossaryTerms.$inferInsert.approvalStatus }, user: AuthenticatedUser) {
  const item = (await db.select().from(businessGlossaryTerms).where(and(eq(businessGlossaryTerms.id, id), isNull(businessGlossaryTerms.deletedAt))).limit(1))[0]; if (!item || !item.modelId || !item.dataSourceId) throw new HttpError(404, "Glossary term not found", "NOT_FOUND"); const model = await requireModel(item.modelId); await requireBusinessContextPermission(user, item.dataSourceId, "BUSINESS_GLOSSARY_MANAGE"); assertEditable(model.status); await db.update(businessGlossaryTerms).set({ ...changes, abbreviations: changes.abbreviations ? json(changes.abbreviations) : undefined, version: item.version + 1, updatedBy: user.id, updatedAt: now() }).where(eq(businessGlossaryTerms.id, id)); return (await db.select().from(businessGlossaryTerms).where(eq(businessGlossaryTerms.id, id)).limit(1))[0];
}

export async function getKpiLineage(id: string, user: AuthenticatedUser) {
  const kpi = await getKpi(id, user); if (!("dataSourceId" in kpi)) return { kpi, nodes: [{ id, type: "KPI", label: kpi.name }], edges: [] }; const sourceFields = await db.select().from(kpiSourceFields).where(and(eq(kpiSourceFields.kpiId, id), isNull(kpiSourceFields.deletedAt))); const fieldIds = sourceFields.map((item) => item.businessFieldId); const fields = fieldIds.length ? await db.select().from(businessFields).where(inArray(businessFields.id, fieldIds)) : []; const objectIds = [...new Set(fields.map((field) => field.businessObjectId))]; const objects = objectIds.length ? await db.select().from(businessObjects).where(inArray(businessObjects.id, objectIds)) : []; const source = (await db.select({ id: dataSources.id, name: dataSources.name }).from(dataSources).where(eq(dataSources.id, kpi.dataSourceId)).limit(1))[0]; const physical = maySeePhysicalMetadata(user); const nodes = [{ id: source.id, type: "DATA_SOURCE", label: source.name }, ...objects.map((item) => ({ id: item.id, type: "BUSINESS_OBJECT", label: item.businessName, physical: physical ? `${item.databaseSchema}.${item.technicalName}` : undefined })), ...fields.map((item) => ({ id: item.id, type: "BUSINESS_FIELD", label: item.businessName, physical: physical ? item.physicalColumnName : undefined })), { id, type: "KPI", label: kpi.name }]; const edges = [...objects.map((item) => ({ source: source.id, target: item.id })), ...fields.map((field) => ({ source: field.businessObjectId, target: field.id })), ...fields.map((field) => ({ source: field.id, target: id }))]; return { kpi, nodes, edges };
}
