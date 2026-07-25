import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { aiBusinessContextAnalysisJobs, aiBusinessContextRecommendations, businessContextModels, businessFields, businessObjects, dataSourceColumns, dataSourceTables } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { assertEditable, requireBusinessContextPermission } from "./permissions";
import { createBusinessObject, requireModel, updateBusinessField } from "./service";
import { redactAnalysisInput, sanitizeMetadataText } from "./security";
export { redactAnalysisInput, sanitizeMetadataText } from "./security";

export type AnalysisTable = { id: string; schemaName: string; tableName: string; objectType: "TABLE" | "VIEW"; description?: string | null; columns: Array<{ id: string; columnName: string; dataType: string; nullable: boolean; isPrimaryKey: boolean; isForeignKey: boolean; sensitivityType: string }> };
export type BusinessObjectAnalysisInput = { modelId: string; schemaName: string; tables: AnalysisTable[] };
export type BusinessFieldAnalysisInput = BusinessObjectAnalysisInput;
export type RelationshipAnalysisInput = BusinessObjectAnalysisInput;
export type KpiSuggestionInput = BusinessObjectAnalysisInput;
export type DescriptionGenerationInput = BusinessObjectAnalysisInput;
export type ProviderRecommendation = { recommendationType: "OBJECT_NAME" | "OBJECT_DESCRIPTION" | "BUSINESS_DOMAIN" | "RECORD_GRAIN" | "FIELD_NAME" | "BUSINESS_TYPE" | "FIELD_ROLE" | "AGGREGATION" | "RELATIONSHIP" | "SYNONYM" | "POTENTIAL_KPI" | "IGNORE_OBJECT" | "SENSITIVE_FIELD"; targetType: "MODEL" | "OBJECT" | "FIELD" | "RELATIONSHIP" | "KPI"; targetId?: string; currentValue?: unknown; suggestedValue: unknown; reason: string; confidenceScore: number; evidence: string[]; impact: "LOW" | "MEDIUM" | "HIGH" };
export type BusinessObjectRecommendation = ProviderRecommendation;
export type BusinessFieldRecommendation = ProviderRecommendation;
export type RelationshipRecommendation = ProviderRecommendation;
export type KpiRecommendation = ProviderRecommendation;
export type DescriptionGenerationResult = ProviderRecommendation;

export interface BusinessContextAnalysisProvider {
  readonly name: string;
  readonly promptVersion: string;
  analyzeObjects(input: BusinessObjectAnalysisInput): Promise<BusinessObjectRecommendation[]>;
  analyzeFields(input: BusinessFieldAnalysisInput): Promise<BusinessFieldRecommendation[]>;
  suggestRelationships(input: RelationshipAnalysisInput): Promise<RelationshipRecommendation[]>;
  suggestKpis(input: KpiSuggestionInput): Promise<KpiRecommendation[]>;
  generateDescriptions(input: DescriptionGenerationInput): Promise<DescriptionGenerationResult[]>;
}

const recommendationSchema = z.object({ recommendationType: z.enum(["OBJECT_NAME", "OBJECT_DESCRIPTION", "BUSINESS_DOMAIN", "RECORD_GRAIN", "FIELD_NAME", "BUSINESS_TYPE", "FIELD_ROLE", "AGGREGATION", "RELATIONSHIP", "SYNONYM", "POTENTIAL_KPI", "IGNORE_OBJECT", "SENSITIVE_FIELD"]), targetType: z.enum(["MODEL", "OBJECT", "FIELD", "RELATIONSHIP", "KPI"]), targetId: z.string().uuid().optional(), currentValue: z.unknown().optional(), suggestedValue: z.unknown(), reason: z.string().min(1).max(2000), confidenceScore: z.number().int().min(0).max(100), evidence: z.array(z.string().max(500)).max(20), impact: z.enum(["LOW", "MEDIUM", "HIGH"]) }).strict();
const recommendationsSchema = z.array(recommendationSchema).max(10000);

const technicalFields = new Set(["ROWKEY", "ROWVERSION", "OBJID", "OBJVERSION"]);

const words = (name: string) => name.replace(/_TAB$/i, "").split("_").filter(Boolean).map((word) => word === "PO" ? "Purchase Order" : word === "PR" ? "Purchase Requisition" : word[0] + word.slice(1).toLowerCase()).join(" ");
const domainFor = (name: string) => /PURCHASE|SUPPLIER|VENDOR|ORDER/.test(name) ? "PROCUREMENT" : /INVENTORY|STOCK|PART/.test(name) ? "INVENTORY" : /WORK_ORDER|MAINT|EQUIPMENT/.test(name) ? "MAINTENANCE" : /AIRCRAFT|FLEET/.test(name) ? "FLEET" : /INVOICE|LEDGER|ACCOUNT/.test(name) ? "FINANCE" : "OTHER";
const grainFor = (name: string) => `One ${words(name).toLowerCase()} record`;

export class IfsPatternAnalysisProvider implements BusinessContextAnalysisProvider {
  readonly name = "IFS_PATTERN_ENGINE"; readonly promptVersion = "ifs-pattern-v1";
  async analyzeObjects(input: BusinessObjectAnalysisInput) { return input.tables.map((table): ProviderRecommendation => ({ recommendationType: "OBJECT_NAME", targetType: "OBJECT", targetId: table.id, suggestedValue: { physicalTableId: table.id, businessName: words(table.tableName), description: table.description || `${words(table.tableName)} business object mapped from approved Oracle metadata.`, domainCode: domainFor(table.tableName), objectType: table.objectType === "VIEW" ? "VIEW" : "UNKNOWN", recordGrain: grainFor(table.tableName), aiUsageAllowed: true }, reason: "Derived from the sanitized Oracle object name and common IFS naming conventions.", confidenceScore: /_TAB$/i.test(table.tableName) ? 88 : 72, evidence: [`Object pattern: ${table.tableName}`, `Schema: ${table.schemaName}`], impact: "HIGH" })); }
  async analyzeFields(input: BusinessFieldAnalysisInput) { return input.tables.flatMap((table) => table.columns.map((column): ProviderRecommendation => { const name = column.columnName.toUpperCase(); const technical = technicalFields.has(name); const sensitive = column.sensitivityType !== "NONE"; const date = /DATE|TIMESTAMP/.test(column.dataType.toUpperCase()); const numeric = /NUMBER|INT|FLOAT|DECIMAL/.test(column.dataType.toUpperCase()); const fieldRole = technical ? "TECHNICAL_FIELD" : sensitive ? "SENSITIVE_FIELD" : column.isPrimaryKey ? "IDENTIFIER" : column.isForeignKey ? "FOREIGN_KEY" : date ? "DATE_DIMENSION" : numeric ? "MEASURE" : /STATUS|STATE/.test(name) ? "STATUS_DIMENSION" : "DIMENSION"; const businessType = date ? "DATE" : numeric ? "NUMBER" : /STATUS|STATE/.test(name) ? "STATUS" : column.isPrimaryKey || column.isForeignKey ? "IDENTIFIER" : "TEXT"; return { recommendationType: technical ? "IGNORE_OBJECT" : sensitive ? "SENSITIVE_FIELD" : "FIELD_ROLE", targetType: "FIELD", targetId: column.id, suggestedValue: { businessName: words(name), businessType, fieldRole, aggregationRule: fieldRole === "MEASURE" ? "SUM" : "NONE", aiUsageAllowed: !technical && !sensitive, visibleToDashboardCreator: !technical && !sensitive }, reason: technical ? "Common IFS technical field; hide only after human review." : sensitive ? "Existing Phase 2 sensitivity classification requires AI exclusion by default." : "Derived from data type, key flags, and IFS column-name patterns.", confidenceScore: technical ? 98 : column.isPrimaryKey || column.isForeignKey ? 95 : 78, evidence: [`Column: ${table.tableName}.${column.columnName}`, `Type: ${column.dataType}`], impact: technical || sensitive ? "HIGH" : "MEDIUM" }; })); }
  async suggestRelationships() { return []; }
  async suggestKpis() { return []; }
  async generateDescriptions(input: DescriptionGenerationInput) { return this.analyzeObjects(input); }
}

async function withRetryAndTimeout<T>(operation: () => Promise<T>, timeoutMs = 30_000, retries = 2) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI analysis timeout")), timeoutMs))]);
  } catch (error) { lastError = error; if (attempt === retries) throw error; }
  throw lastError;
}

export async function runBusinessContextAnalysis(modelId: string, user: AuthenticatedUser, provider: BusinessContextAnalysisProvider = new IfsPatternAnalysisProvider()) {
  const model = await requireModel(modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_CONTEXT_ANALYZE"); assertEditable(model.status);
  const tables = await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.dataSourceId, model.dataSourceId), eq(dataSourceTables.schemaName, model.schemaName), eq(dataSourceTables.isIncluded, true), eq(dataSourceTables.status, "ACTIVE")));
  const selected = tables.slice(0, 500); const tableIds = new Set(selected.map((table) => table.id)); const columns = selected.length ? await db.select().from(dataSourceColumns).where(and(inArray(dataSourceColumns.tableId, selected.map((table) => table.id)), eq(dataSourceColumns.status, "ACTIVE"))) : [];
  const input = redactAnalysisInput({ modelId, schemaName: model.schemaName, tables: selected.map((table) => ({ id: table.id, schemaName: table.schemaName, tableName: table.tableName, objectType: table.objectType, description: table.description, columns: columns.filter((column) => tableIds.has(column.tableId) && column.tableId === table.id).map((column) => ({ id: column.id, columnName: column.columnName, dataType: column.dataType, nullable: column.nullable, isPrimaryKey: column.isPrimaryKey, isForeignKey: column.isForeignKey, sensitivityType: column.sensitivityType })) })) });
  const serialized = JSON.stringify(input); const timestamp = new Date(); const jobId = randomUUID();
  await db.insert(aiBusinessContextAnalysisJobs).values({ id: jobId, modelId, dataSourceId: model.dataSourceId, status: "RUNNING", provider: provider.name, promptVersion: provider.promptVersion, inputHash: createHash("sha256").update(serialized).digest("hex"), progressStep: "Analyzing objects and fields", inputTokenCount: Math.ceil(serialized.length / 4), redactedInput: serialized, startedBy: user.id, startedAt: timestamp, createdAt: timestamp, updatedAt: timestamp });
  await db.update(businessContextModels).set({ status: "AI_ANALYZING", updatedAt: timestamp, updatedBy: user.id }).where(eq(businessContextModels.id, modelId));
  try {
    const raw = await withRetryAndTimeout(async () => [...await provider.analyzeObjects(input), ...await provider.analyzeFields(input), ...await provider.suggestRelationships(input), ...await provider.suggestKpis(input)]);
    const recommendations = recommendationsSchema.parse(raw); const completedAt = new Date();
    if (recommendations.length) await db.insert(aiBusinessContextRecommendations).values(recommendations.map((item) => ({ id: randomUUID(), modelId, jobId, recommendationType: item.recommendationType, targetType: item.targetType, targetId: item.targetId, currentValue: item.currentValue === undefined ? undefined : JSON.stringify(item.currentValue), suggestedValue: JSON.stringify(item.suggestedValue), reason: item.reason, confidenceScore: item.confidenceScore, evidence: JSON.stringify(item.evidence), impact: item.impact, createdBy: user.id, updatedBy: user.id, createdAt: completedAt, updatedAt: completedAt })));
    const outputLength = JSON.stringify(recommendations).length;
    await db.update(aiBusinessContextAnalysisJobs).set({ status: "COMPLETED", progressStep: "Ready for human review", recommendationCount: recommendations.length, outputTokenCount: Math.ceil(outputLength / 4), completedAt, updatedAt: completedAt }).where(eq(aiBusinessContextAnalysisJobs.id, jobId));
    await db.update(businessContextModels).set({ status: "DRAFT", updatedAt: completedAt, updatedBy: user.id }).where(eq(businessContextModels.id, modelId));
    return { jobId, recommendationCount: recommendations.length };
  } catch (error) {
    const completedAt = new Date(); await db.update(aiBusinessContextAnalysisJobs).set({ status: "FAILED", errorSummary: error instanceof Error ? sanitizeMetadataText(error.message, 500) : "Analysis failed", completedAt, updatedAt: completedAt }).where(eq(aiBusinessContextAnalysisJobs.id, jobId)); await db.update(businessContextModels).set({ status: "DRAFT", updatedAt: completedAt, updatedBy: user.id }).where(eq(businessContextModels.id, modelId)); throw error;
  }
}

export async function reviewRecommendation(id: string, input: { decision: "ACCEPT" | "REJECT"; modifiedValue?: unknown }, user: AuthenticatedUser) {
  const recommendation = (await db.select().from(aiBusinessContextRecommendations).where(and(eq(aiBusinessContextRecommendations.id, id), isNull(aiBusinessContextRecommendations.deletedAt))).limit(1))[0]; if (!recommendation) throw new HttpError(404, "Recommendation not found", "NOT_FOUND");
  const model = await requireModel(recommendation.modelId); await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_CONTEXT_REVIEW"); assertEditable(model.status);
  if (recommendation.status !== "PENDING") throw new HttpError(409, "Recommendation has already been reviewed", "ALREADY_REVIEWED");
  const timestamp = new Date();
  if (input.decision === "ACCEPT") {
    const value = input.modifiedValue ?? JSON.parse(recommendation.suggestedValue) as unknown;
    if (recommendation.targetType === "OBJECT" && recommendation.recommendationType === "OBJECT_NAME") {
      const parsed = z.object({ physicalTableId: z.string().uuid(), businessName: z.string().min(2).max(255), description: z.string().max(4000).optional(), objectType: z.enum(["TRANSACTION", "MASTER_DATA", "REFERENCE_DATA", "SNAPSHOT", "AGGREGATE", "BRIDGE", "VIEW", "UNKNOWN"]), recordGrain: z.string().max(500), aiUsageAllowed: z.boolean() }).passthrough().parse(value);
      const exists = (await db.select().from(businessObjects).where(and(eq(businessObjects.modelId, model.id), eq(businessObjects.physicalTableId, parsed.physicalTableId))).limit(1))[0]; if (!exists) await createBusinessObject(model.id, { ...parsed, mapFields: true }, user);
    } else if (recommendation.targetType === "FIELD" && recommendation.targetId) {
      const field = (await db.select().from(businessFields).where(and(eq(businessFields.modelId, model.id), eq(businessFields.physicalColumnId, recommendation.targetId))).limit(1))[0];
      if (field) await updateBusinessField(field.id, z.object({ businessName: z.string().optional(), businessType: z.enum(["TEXT", "NUMBER", "CURRENCY", "PERCENTAGE", "BOOLEAN", "DATE", "DATETIME", "DURATION", "QUANTITY", "STATUS", "IDENTIFIER", "GEOGRAPHIC", "URL", "EMAIL", "PHONE", "UNKNOWN"]).optional(), fieldRole: z.enum(["DIMENSION", "MEASURE", "IDENTIFIER", "DATE_DIMENSION", "STATUS_DIMENSION", "FOREIGN_KEY", "TECHNICAL_FIELD", "SENSITIVE_FIELD", "IGNORED"]).optional(), aggregationRule: z.enum(["SUM", "AVERAGE", "COUNT", "COUNT_DISTINCT", "MINIMUM", "MAXIMUM", "LATEST", "EARLIEST", "NONE", "CUSTOM"]).optional(), aiUsageAllowed: z.boolean().optional(), visibleToDashboardCreator: z.boolean().optional() }).strict().parse(value), user);
    }
    await db.update(aiBusinessContextRecommendations).set({ status: input.modifiedValue ? "MODIFIED" : "ACCEPTED", suggestedValue: JSON.stringify(value), reviewedBy: user.id, reviewedAt: timestamp, updatedBy: user.id, updatedAt: timestamp }).where(eq(aiBusinessContextRecommendations.id, id));
  } else await db.update(aiBusinessContextRecommendations).set({ status: "REJECTED", reviewedBy: user.id, reviewedAt: timestamp, updatedBy: user.id, updatedAt: timestamp }).where(eq(aiBusinessContextRecommendations.id, id));
  return (await db.select().from(aiBusinessContextRecommendations).where(eq(aiBusinessContextRecommendations.id, id)).limit(1))[0];
}
