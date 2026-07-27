import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { businessFields, businessObjects, dataSourceColumns, dataSourceRelationships, dataSourceTables, kpiDefinitions } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { profileTableColumns, profileTableColumnsAggregated } from "@/lib/data-sources/preview";
import { assertEditable, requireBusinessContextPermission } from "./permissions";
import { createBusinessObject, createKpi, requireModel, updateBusinessField } from "./service";
import { sanitizeMetadataText } from "./security";
import { findMeasureColumns, normalizeObjectSuggestions } from "./object-suggestion";
import { normalizeKpiSuggestions } from "./kpi-suggestion";
import { classifyBusinessField, profileExclusionReasons, type ColumnProfile } from "./column-profile";
import { aiRequestTimeoutMs } from "./ai-config";
import { inferAnalyticalRole, interpretBusinessIntent, scoreIntentField, semanticRelevance } from "./business-intent";

const descriptionSchema = z.object({ description: z.string().trim().min(10).max(600) }).strict();
const kpiSuggestionSchema = z.object({ kpis: z.array(z.object({
  code: z.string().trim().max(80), name: z.string().trim().min(2).max(255), description: z.string().trim().min(10).max(1000),
  businessObjective: z.string().trim().max(1000).optional(), businessQuestion: z.string().trim().max(1000).optional(), fieldId: z.string().uuid(),
  aggregation: z.enum(["SUM", "AVERAGE", "COUNT", "COUNT_DISTINCT", "MINIMUM", "MAXIMUM"]), measureType: z.enum(["ADDITIVE", "SEMI_ADDITIVE", "NON_ADDITIVE", "RATIO", "COUNT"]),
  unit: z.string().trim().max(80).optional(), recommendedVisualization: z.string().trim().max(80).optional(),
  denominatorFieldId: z.string().uuid().optional(), denominatorAggregation: z.enum(["SUM", "AVERAGE", "COUNT", "COUNT_DISTINCT", "MINIMUM", "MAXIMUM"]).optional(),
  usefulDimensionFieldIds: z.array(z.string()).max(8).default([]), confidenceScore: z.number().min(0).max(100).default(70), evidence: z.array(z.string().max(300)).max(8).default([]), warnings: z.array(z.string().max(300)).max(8).default([]),
}).strict()).min(1).max(8) }).strict();

const kpiAnalysisSchema = z.object({
  businessProcess: z.string().trim().max(1000).optional(), rowGrain: z.string().trim().max(1000).optional(),
  importantEntities: z.array(z.string().trim().max(255)).max(20).default([]), recommendedDimensions: z.array(z.string().trim().max(255)).max(30).default([]),
  recommendedMeasures: z.array(z.string().trim().max(255)).max(30).default([]), businessQuestions: z.array(z.string().trim().max(500)).max(20).default([]),
  recommendedVisualizations: z.array(z.string().trim().max(255)).max(20).default([]), dataQualityWarnings: z.array(z.string().trim().max(500)).max(30).default([]),
}).passthrough();

const businessIntentAnalysisSchema = z.object({
  businessDomain: z.string().trim().max(255).optional(),
  businessObjective: z.string().trim().max(1000).optional(),
  businessSummary: z.string().trim().max(1000).optional(),
  businessQuestions: z.array(z.string().trim().max(500)).max(20).optional(),
  dataCoverage: z.array(z.string().trim().max(255)).max(30).optional(),
  warnings: z.array(z.string().trim().max(500)).max(30).optional(),
}).strict();

type AiBody = { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };

export type KpiGenerationProgress = {
  stage: "PREPARING_CONTEXT" | "PROFILING_DATA" | "CLASSIFYING_FIELDS" | "GENERATING_CANDIDATES" | "USING_FALLBACK" | "VALIDATING_CANDIDATES" | "SAVING_DRAFTS";
  label: string;
  detail: string;
  percent: number;
};

export type BusinessObjectGenerationProgress = {
  stage: "DISCOVERING_TABLES" | "CLASSIFYING_OBJECTS" | "GENERATING_CANDIDATES" | "USING_FALLBACK" | "VERIFYING_DATA" | "MAPPING_OBJECTS";
  label: string;
  detail: string;
  percent: number;
};

type ProgressReporter = (progress: KpiGenerationProgress) => void;

function aiConfig() {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/$/, "");
  const model = process.env.AI_MODEL;
  return apiKey && baseUrl && model ? { apiKey, baseUrl, model, provider: (process.env.AI_PROVIDER || "openai").toLowerCase() } : null;
}

function responseText(body: AiBody) {
  return body.output_text || body.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") || body.choices?.[0]?.message?.content || "";
}

function parseJson(value: string) {
  return JSON.parse(value.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as unknown;
}

async function requestStructuredAi(system: string, context: unknown) {
  const config = aiConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), aiRequestTimeoutMs());
  try {
    const useResponses = config.provider === "openai" || /api\.openai\.com/i.test(config.baseUrl);
    const response = await fetch(`${config.baseUrl}/${useResponses ? "responses" : "chat/completions"}`, {
      method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(useResponses
        ? { model: config.model, instructions: system, input: JSON.stringify(context), reasoning: { effort: "low" }, text: { verbosity: "low" } }
        : { model: config.model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(context) }] }),
    });
    const body = await response.json() as AiBody;
    if (!response.ok) throw new Error(body.error?.message || "AI provider request failed");
    return parseJson(responseText(body));
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new HttpError(502, timedOut ? "AI assistance timed out" : "AI assistance is temporarily unavailable", timedOut ? "AI_TIMEOUT" : "AI_REQUEST_FAILED");
  } finally { clearTimeout(timer); }
}

function fallbackDescription(field: { businessName: string; businessType: string; fieldRole: string }, objectName: string) {
  const role = field.fieldRole.replaceAll("_", " ").toLowerCase();
  return `${field.businessName} represents the ${field.businessType.toLowerCase()} value used as a ${role} for ${objectName}.`;
}

function businessName(value: string) {
  return value.replace(/_TAB$/i, "").split("_").filter(Boolean).map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}

export async function generateDraftBusinessObjectsWithAi(modelId: string, user: AuthenticatedUser, reportProgress?: (progress: BusinessObjectGenerationProgress) => void) {
  reportProgress?.({ stage: "DISCOVERING_TABLES", label: "Discovering candidate tables and views", detail: "Loading synchronized metadata and excluding objects already mapped to this Business Context.", percent: 6 });
  const model = await requireModel(modelId);
  await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_OBJECT_MANAGE");
  assertEditable(model.status);
  const intent=interpretBusinessIntent(model.name,model.description);
  const [mapped, tables] = await Promise.all([
    // Include archived mappings: removing a generated object is also a decision
    // that the same physical table must not be suggested again automatically.
    db.select({ tableId: businessObjects.physicalTableId }).from(businessObjects).where(eq(businessObjects.modelId, modelId)),
    db.select({ id: dataSourceTables.id, tableName: dataSourceTables.tableName, businessName: dataSourceTables.businessName, description: dataSourceTables.description, objectType: dataSourceTables.objectType, estimatedRowCount: dataSourceTables.estimatedRowCount }).from(dataSourceTables).where(and(eq(dataSourceTables.dataSourceId, model.dataSourceId), eq(dataSourceTables.schemaName, model.schemaName), eq(dataSourceTables.isIncluded, true), eq(dataSourceTables.status, "ACTIVE"))).orderBy(asc(dataSourceTables.tableName)),
  ]);
  const mappedIds = new Set(mapped.map((item) => item.tableId));
  const configuredDiscoveryLimit=Number(process.env.BUSINESS_CONTEXT_DISCOVERY_TABLE_LIMIT??400);const discoveryLimit=Math.min(800,Math.max(100,Number.isFinite(configuredDiscoveryLimit)?configuredDiscoveryLimit:400));
  const unmapped = tables.filter((table) => !mappedIds.has(table.id)&&table.estimatedRowCount!==0).map(table=>({table,preScore:semanticRelevance(intent,table.tableName,table.businessName,table.description)})).sort((a,b)=>b.preScore-a.preScore||(Number(b.table.estimatedRowCount!==null)-Number(a.table.estimatedRowCount!==null))||a.table.tableName.localeCompare(b.table.tableName)).slice(0,discoveryLimit).map(item=>item.table);
  if (!unmapped.length) throw new HttpError(409, "No unmapped tables or views are available in this Business Context schema", "NO_AVAILABLE_TABLES");
  const [columns,physicalRelationships] = await Promise.all([db.select({ id:dataSourceColumns.id,tableId: dataSourceColumns.tableId, columnName: dataSourceColumns.columnName,businessName:dataSourceColumns.businessName,description:dataSourceColumns.description, dataType: dataSourceColumns.dataType, isPrimaryKey: dataSourceColumns.isPrimaryKey, isForeignKey: dataSourceColumns.isForeignKey, sensitivityType: dataSourceColumns.sensitivityType }).from(dataSourceColumns).where(and(inArray(dataSourceColumns.tableId, unmapped.map((table) => table.id)), eq(dataSourceColumns.isIncluded, true), eq(dataSourceColumns.status, "ACTIVE"))),db.select().from(dataSourceRelationships).where(eq(dataSourceRelationships.dataSourceId,model.dataSourceId))]);
  const columnsByTable = new Map<string, typeof columns>();
  for (const column of columns) columnsByTable.set(column.tableId, [...(columnsByTable.get(column.tableId) ?? []), column]);
  reportProgress?.({ stage: "CLASSIFYING_OBJECTS", label: "Classifying business objects", detail: "Separating transactional and measurable objects from master, lookup, and configuration data.", percent: 24 });
  const relationshipCounts=new Map<string,number>();for(const relation of physicalRelationships){relationshipCounts.set(relation.sourceTableId,(relationshipCounts.get(relation.sourceTableId)??0)+1);relationshipCounts.set(relation.targetTableId,(relationshipCounts.get(relation.targetTableId)??0)+1);}
  const ranked=unmapped.map(table=>{const tableColumns=columnsByTable.get(table.id)??[];const relevanceScore=Math.min(100,semanticRelevance(intent,table.tableName,table.businessName,table.description,...tableColumns.flatMap(column=>[column.columnName,column.businessName,column.description]))+Math.min(20,(relationshipCounts.get(table.id)??0)*4));return{...table,relevanceScore,relationshipCount:relationshipCounts.get(table.id)??0,measureColumns:findMeasureColumns(tableColumns).slice(0,20),candidateColumns:tableColumns.filter(column=>column.sensitivityType==="NONE"&&!/BLOB|CLOB|LONG|XMLTYPE|RAW/i.test(column.dataType)).sort((a,b)=>(Number(b.isPrimaryKey||b.isForeignKey)-Number(a.isPrimaryKey||a.isForeignKey))||semanticRelevance(intent,b.columnName,b.businessName,b.description)-semanticRelevance(intent,a.columnName,a.businessName,a.description)).slice(0,40)};}).filter(table=>table.estimatedRowCount!==0&&table.candidateColumns.length>0).sort((a,b)=>b.relevanceScore-a.relevanceScore||b.measureColumns.length-a.measureColumns.length);
  const candidates=(ranked.filter(table=>table.relevanceScore>=15).slice(0,12).length?ranked.filter(table=>table.relevanceScore>=15).slice(0,12):ranked.filter(table=>table.measureColumns.length).slice(0,12));
  const skippedNonMeasureCount = unmapped.length - candidates.length;
  if (!candidates.length) throw new HttpError(409, "No populated tables or views contain fields relevant to this Business Context intent", "NO_RELEVANT_TABLES");
  const safeContext = { intent, context: { name: sanitizeMetadataText(model.name, 190), description: sanitizeMetadataText(model.description, 500) }, tables: candidates.map((table) => ({ id: table.id, name: table.tableName, businessName: sanitizeMetadataText(table.businessName, 255), description: sanitizeMetadataText(table.description, 500), type: table.objectType, rowCountKnownPositive: typeof table.estimatedRowCount === "number" ? table.estimatedRowCount > 0 : null,relevanceScore:table.relevanceScore,relationshipCount:table.relationshipCount, fields: table.candidateColumns.map((column) => ({ id:column.id,name: sanitizeMetadataText(column.columnName, 128),businessName:sanitizeMetadataText(column.businessName,255),description:sanitizeMetadataText(column.description,300), dataType: column.dataType,primaryKey:column.isPrimaryKey,foreignKey:column.isForeignKey })) })) };
  reportProgress?.({ stage: "GENERATING_CANDIDATES", label: "Generating Business Object candidates", detail: "AI is matching the Business Context meaning to measurable tables and views.", percent: 38 });
  let generated: unknown = null;
  let generationMode: "AI" | "RULE_BASED" | "TIMEOUT_FALLBACK" | "PROVIDER_FALLBACK" = aiConfig() ? "AI" : "RULE_BASED";
  try {
    generated = await requestStructuredAi("Interpret the supplied Model Name and Description as the primary business intent, then select 1-8 complementary tables/views that together cover the intent. Use table comments, column comments, data types, keys, relationship counts and server relevance scores; never choose from names alone and never invent metadata. Transaction, snapshot, master and reference objects are allowed only when they add necessary business coverage. Reject empty, technical-only, configuration and duplicate objects. Use only listed table IDs. Return JSON with {analysis,objects}; analysis may refine businessDomain,businessObjective,businessSummary,businessQuestions,dataCoverage,warnings. Each object has tableId,businessName,description,recordGrain,objectType,businessCategory,role,relevanceScore,reasons.", safeContext);
  } catch (error) {
    if (!(error instanceof HttpError) || !["AI_TIMEOUT", "AI_REQUEST_FAILED"].includes(error.code)) throw error;
    generationMode = error.code === "AI_TIMEOUT" ? "TIMEOUT_FALLBACK" : "PROVIDER_FALLBACK";
    reportProgress?.({ stage: "USING_FALLBACK", label: "Continuing with governed fallback", detail: error.code === "AI_TIMEOUT" ? "AI exceeded the time limit; measurable table rules will complete the draft selection." : "AI provider is unavailable; measurable table rules will complete the draft selection.", percent: 54 });
  }
  const fallback = { objects: candidates.slice(0, 6).map((table) => ({ tableId: table.id, businessName: table.businessName || businessName(table.tableName), description: `${table.businessName || businessName(table.tableName)} supports ${intent.primaryObjective}`, objectType: table.objectType === "VIEW" ? "VIEW" as const : table.measureColumns.length?"TRANSACTION" as const:"REFERENCE_DATA" as const })) };
  let suggestions;
  try { suggestions = normalizeObjectSuggestions(generated ?? fallback, candidates).objects; }
  catch { suggestions = normalizeObjectSuggestions(fallback, candidates).objects; }
  if (!suggestions.length) suggestions = normalizeObjectSuggestions(fallback, candidates).objects;
  const fallbackSuggestions=normalizeObjectSuggestions(fallback,candidates).objects;const suggestedIds=new Set(suggestions.map(item=>item.tableId));suggestions=[...suggestions,...fallbackSuggestions.filter(item=>!suggestedIds.has(item.tableId))].slice(0,8);
  const allowed = new Map(candidates.map((table) => [table.id, table]));
  const created = [];const draftTables=[]; let skippedEmptyCount = 0;
  for (const [suggestionIndex, suggestion] of suggestions.entries()) {
    const table = allowed.get(suggestion.tableId);
    if (!table) continue;
    reportProgress?.({ stage: "VERIFYING_DATA", label: `Verifying ${table.businessName || table.tableName}`, detail: `Checking that analytical fields contain usable and varying data (${suggestionIndex + 1} of ${suggestions.length}).`, percent: Math.min(78, 58 + Math.round(((suggestionIndex + 1) / Math.max(suggestions.length, 1)) * 20)) });
    let profiles:Record<string,ColumnProfile>;try{profiles=await profileTableColumnsAggregated(model.dataSourceId,table.id,table.candidateColumns.map(column=>column.columnName));}catch{throw new HttpError(502,`Data profile could not be completed for ${table.tableName}. Check the Data Source connection and retry.`,"DATA_PROFILE_FAILED");}
    const scoredFields=table.candidateColumns.map(column=>({column,profile:profiles[column.columnName],score:scoreIntentField(intent,column,profiles[column.columnName],column.isForeignKey?Math.max(1,table.relationshipCount):0,table.relevanceScore)})).filter(item=>item.profile);const selectedFields=scoredFields.filter(item=>item.score.selected);if(!selectedFields.length){skippedEmptyCount+=1;continue;}
    reportProgress?.({ stage: "MAPPING_OBJECTS", label: `Mapping ${suggestion.businessName}`, detail: "Creating the Draft Business Object and governed Business Field mappings.", percent: Math.min(94, 80 + Math.round(((suggestionIndex + 1) / Math.max(suggestions.length, 1)) * 14)) });
    const createdObject=await createBusinessObject(modelId, { physicalTableId: table.id, businessName: sanitizeMetadataText(suggestion.businessName, 255), description: sanitizeMetadataText(suggestion.description, 1000), recordGrain: sanitizeMetadataText(suggestion.recordGrain, 500), objectType: suggestion.objectType, mapFields: true, aiUsageAllowed: true, notes: JSON.stringify({generatedBy:"BUSINESS_INTENT_PROFILE_V1",businessDomain:intent.domain,relevanceScore:table.relevanceScore,reasons:[`Matches ${intent.domain} intent`,`${selectedFields.length} eligible fields`,`${table.relationshipCount} metadata relationships`]}) }, user);created.push(createdObject);
    const mappedFields=await db.select().from(businessFields).where(eq(businessFields.businessObjectId,createdObject.id));const scoredByColumn=new Map(scoredFields.map(item=>[item.column.columnName,item]));for(const field of mappedFields){const scored=scoredByColumn.get(field.physicalColumnName);const selected=Boolean(scored?.score.selected);const role=scored?.score.role??inferAnalyticalRole({columnName:field.physicalColumnName,dataType:field.physicalDataType,isPrimaryKey:field.isPrimaryKey,isForeignKey:field.isForeignKey});const fieldRole=role==="measure"?"MEASURE":role==="date"?"DATE_DIMENSION":role==="status"?"STATUS_DIMENSION":role==="identifier"?"IDENTIFIER":role==="relationship_key"?"FOREIGN_KEY":role==="technical"?"TECHNICAL_FIELD":selected?"DIMENSION":"IGNORED";await db.update(businessFields).set({fieldRole,aggregationRule:fieldRole==="MEASURE"?"SUM":"NONE",aiUsageAllowed:selected,visibleToDashboardCreator:selected,description:scored?sanitizeMetadataText(`${selected?"Selected":"Excluded"}: ${scored.score.reasons.join(", ")}.`,1000):"Excluded: field was outside the profiled semantic candidate set.",exampleValues:scored?JSON.stringify({profile:scored.profile,score:scored.score.finalScore,reasons:scored.score.reasons}):undefined,updatedAt:new Date(),updatedBy:user.id}).where(eq(businessFields.id,field.id));}
    draftTables.push({tableId:table.id,sourceTableName:table.tableName,businessName:suggestion.businessName,description:suggestion.description,businessCategory:intent.domain,role:table.measureColumns.length?"transaction":"reference",relevanceScore:table.relevanceScore,rowCount:table.estimatedRowCount??profiles[table.candidateColumns[0]?.columnName]?.totalRowCount??0,selectedFieldCount:selectedFields.length,excludedFieldCount:scoredFields.length-selectedFields.length,reasons:[`Matches ${intent.domain} intent`,`${selectedFields.length} populated useful fields`,`${table.relationshipCount} metadata relationships`],fields:scoredFields.map(item=>({id:mappedFields.find(field=>field.physicalColumnName===item.column.columnName)?.id,sourceColumnName:item.column.columnName,businessName:item.column.businessName||businessName(item.column.columnName),description:item.column.description,dataType:item.column.dataType,role:item.score.role,aggregation:item.score.role==="measure"?"sum":undefined,selected:item.score.selected,score:item.score.finalScore,profile:item.profile,reasons:item.score.reasons}))});
  }
  if (!created.length) throw new HttpError(409, "No candidate table contained an analytical field that passed the configured data-quality and relevance thresholds. Review the Model Description or lower BUSINESS_CONTEXT_MIN_FIELD_SCORE.", "NO_ELIGIBLE_BUSINESS_FIELDS");
  const rawAnalysis=generated&&typeof generated==="object"?(generated as Record<string,unknown>).analysis:null;
  const parsedAnalysis=businessIntentAnalysisSchema.safeParse(rawAnalysis);
  const analysis=parsedAnalysis.success?parsedAnalysis.data:{};
  const selectedIds=new Set(draftTables.map(table=>table.tableId));const columnNames=new Map(columns.map(column=>[column.id,column.columnName]));const tableNames=new Map(unmapped.map(table=>[table.id,table.tableName]));
  const suggestedRelationships=physicalRelationships.filter(relation=>selectedIds.has(relation.sourceTableId)&&selectedIds.has(relation.targetTableId)).map(relation=>({sourceTable:tableNames.get(relation.sourceTableId),sourceField:relation.sourceColumnId?columnNames.get(relation.sourceColumnId):undefined,targetTable:tableNames.get(relation.targetTableId),targetField:relation.targetColumnId?columnNames.get(relation.targetColumnId):undefined,relationshipType:relation.relationshipType,confidenceScore:relation.confidenceScore,discoveryMethod:relation.discoveryMethod}));
  const excludedTables=ranked.filter(table=>!selectedIds.has(table.id)).slice(0,40).map(table=>({sourceTableName:table.tableName,businessName:table.businessName||businessName(table.tableName),relevanceScore:table.relevanceScore,reasons:[table.relevanceScore<15?"low relevance to the model business intent":"not selected after ranking",table.estimatedRowCount===0?"metadata reports no rows":"a higher-ranked table provides better coverage"]}));
  const draft={modelName:model.name,modelDescription:model.description,businessDomain:analysis.businessDomain??intent.domain,businessObjective:analysis.businessObjective??intent.primaryObjective,businessSummary:analysis.businessSummary??intent.businessSummary,businessQuestions:analysis.businessQuestions??intent.businessQuestions,dataCoverage:analysis.dataCoverage??draftTables.map(table=>table.businessName),selectedTables:draftTables,suggestedRelationships,excludedTables,warnings:[...(analysis.warnings??[]),"Field ratios are governed sampled estimates; each profile shows its sample size and profiling time."]};
  return { createdCount: created.length, skippedEmptyCount, skippedNonMeasureCount, generationMode, intent, draft, objects: created.map((item) => ({ id: item.id, businessName: item.businessName, approvalStatus: item.approvalStatus })) };
}

export async function generateBusinessFieldDescription(fieldId: string, user: AuthenticatedUser) {
  const field = (await db.select().from(businessFields).where(and(eq(businessFields.id, fieldId), isNull(businessFields.deletedAt))).limit(1))[0];
  if (!field) throw new HttpError(404, "Business Field not found", "NOT_FOUND");
  const model = await requireModel(field.modelId);
  await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_FIELD_MANAGE");
  assertEditable(model.status);
  const object = (await db.select({ businessName: businessObjects.businessName, description: businessObjects.description }).from(businessObjects).where(and(eq(businessObjects.id, field.businessObjectId), isNull(businessObjects.deletedAt))).limit(1))[0];
  if (!object) throw new HttpError(404, "Business Object not found", "NOT_FOUND");
  const context = { object: { name: sanitizeMetadataText(object.businessName, 255), description: sanitizeMetadataText(object.description, 500) }, field: { name: sanitizeMetadataText(field.businessName, 255), type: field.businessType, role: field.fieldRole, aggregation: field.aggregationRule, nullable: field.nullable } };
  const generated = await requestStructuredAi("Summarize the business meaning of this Business Field in one concise sentence. Use only the supplied semantic metadata, never invent business rules, row values, SQL, schemas, or identifiers. Return exactly {\"description\":\"...\"}.", context);
  const description = generated ? descriptionSchema.parse(generated).description : fallbackDescription(field, object.businessName);
  return updateBusinessField(field.id, { description }, user);
}

function safeCode(value: string) {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "KPI";
  return /^[A-Z]/.test(code) ? code : `KPI_${code}`.slice(0, 80);
}

function fallbackKpis(fields: Array<{ id: string; businessName: string; businessType: string; fieldRole: string; aggregationRule: string; unit: string | null }>) {
  return { kpis: fields.slice(0, 6).map((field) => {
    const count = field.fieldRole === "IDENTIFIER" || field.businessType === "IDENTIFIER";
    return { code: safeCode(`${count ? "COUNT" : field.aggregationRule === "NONE" ? "SUM" : field.aggregationRule}_${field.businessName}`), name: `${count ? "Count of" : "Total"} ${field.businessName}`, description: `${count ? "Count of distinct" : "Aggregated total for"} ${field.businessName} across the governed Business Context.`, businessObjective: `Monitor ${field.businessName} using governed field definitions.`, businessQuestion: count ? `How many distinct ${field.businessName} records are there?` : `What is the total ${field.businessName}?`, fieldId: field.id, aggregation: count ? "COUNT_DISTINCT" as const : "SUM" as const, measureType: count ? "COUNT" as const : "ADDITIVE" as const, unit: field.unit ?? undefined, recommendedVisualization: "KPI card" };
  }) };
}

export async function generateDraftKpisWithAi(modelId: string, user: AuthenticatedUser, reportProgress?: ProgressReporter) {
  reportProgress?.({ stage: "PREPARING_CONTEXT", label: "Reading governed context", detail: "Loading Business Objects, Business Fields, and existing KPI definitions.", percent: 5 });
  const model = await requireModel(modelId);
  await requireBusinessContextPermission(user, model.dataSourceId, "KPI_CREATE");
  assertEditable(model.status);
  const [objects, fields, existing] = await Promise.all([
    db.select({ id: businessObjects.id, physicalTableId: businessObjects.physicalTableId, businessName: businessObjects.businessName, description: businessObjects.description, recordGrain: businessObjects.recordGrain }).from(businessObjects).where(and(eq(businessObjects.modelId, modelId), isNull(businessObjects.deletedAt))).orderBy(asc(businessObjects.businessName)),
    db.select({ id: businessFields.id, businessObjectId: businessFields.businessObjectId, physicalColumnName: businessFields.physicalColumnName, physicalDataType: businessFields.physicalDataType, businessName: businessFields.businessName, description: businessFields.description, businessType: businessFields.businessType, fieldRole: businessFields.fieldRole, aggregationRule: businessFields.aggregationRule, unit: businessFields.unit, isPrimaryKey: businessFields.isPrimaryKey, isForeignKey: businessFields.isForeignKey, aiUsageAllowed: businessFields.aiUsageAllowed }).from(businessFields).where(and(eq(businessFields.modelId, modelId), eq(businessFields.sensitivityClassification, "NONE"), isNull(businessFields.deletedAt))).orderBy(asc(businessFields.businessName)),
    db.select({ code: kpiDefinitions.code, name: kpiDefinitions.name }).from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, modelId), isNull(kpiDefinitions.deletedAt))),
  ]);
  const profiles = new Map<string, ColumnProfile>();
  const profilingWarnings: string[] = [];
  for (const [objectIndex, object] of objects.entries()) {
    const allowedObjectFields = fields.filter((field) => field.businessObjectId === object.id && field.aiUsageAllowed);
    const objectFields = allowedObjectFields.filter((field) => !/BLOB|CLOB|LONG|XMLTYPE|RAW/i.test(field.physicalDataType)).slice(0, 120);
    if (!objectFields.length) continue;
    reportProgress?.({ stage: "PROFILING_DATA", label: `Profiling ${object.businessName}`, detail: `Checking populated, varying, and analytically useful values (${objectIndex + 1} of ${objects.length}).`, percent: Math.min(46, 12 + Math.round(((objectIndex + 1) / Math.max(objects.length, 1)) * 34)) });
    try {
      const result = await profileTableColumns(model.dataSourceId, object.physicalTableId, objectFields.map((field) => field.physicalColumnName));
      objectFields.forEach((field) => { const profile = result[field.physicalColumnName]; if (profile) profiles.set(field.id, profile); });
      if (fields.filter((field) => field.businessObjectId === object.id && field.aiUsageAllowed).length > 120) profilingWarnings.push(`${object.businessName}: profiling was limited to the first 120 AI-allowed fields.`);
      if (objectFields.length < allowedObjectFields.length && allowedObjectFields.some((field) => /BLOB|CLOB|LONG|XMLTYPE|RAW/i.test(field.physicalDataType))) profilingWarnings.push(`${object.businessName}: large-object and binary fields were excluded from profiling.`);
    } catch { profilingWarnings.push(`${object.businessName}: the live data profile could not be completed.`); }
  }
  reportProgress?.({ stage: "CLASSIFYING_FIELDS", label: "Classifying analytical fields", detail: "Separating measures, dimensions, identifiers, technical fields, and unusable values.", percent: 50 });
  const classified = fields.map((field) => {
    const profile = profiles.get(field.id);
    const classification = classifyBusinessField(field);
    const exclusionReasons = [...(!field.aiUsageAllowed ? ["AI usage is not allowed"] : []), ...(profile ? profileExclusionReasons(field, profile) : ["data profile is unavailable"] )];
    return { ...field, profile, classification, exclusionReasons };
  });
  const measureClasses = new Set(["numeric_measure", "monetary_measure", "duration_measure"]);
  const eligible = classified.filter((field) => field.aiUsageAllowed && field.profile && !field.exclusionReasons.length && (measureClasses.has(field.classification) || (field.classification === "identifier" && (field.isPrimaryKey || field.fieldRole === "IDENTIFIER") && !field.isForeignKey)));
  const dimensions = classified.filter((field) => field.aiUsageAllowed && field.profile && !field.exclusionReasons.length && ["status_dimension", "categorical_dimension", "date_dimension"].includes(field.classification));
  if (!eligible.length) throw new HttpError(409, "No fields contain sufficiently complete and varying data for KPI generation", "NO_PROFILED_MEASURES");
  const safeContext = {
    model: { name: sanitizeMetadataText(model.name, 190), description: sanitizeMetadataText(model.description, 500) },
    objects: objects.map((item) => ({ id: item.id, name: sanitizeMetadataText(item.businessName, 255), description: sanitizeMetadataText(item.description, 500), rowGrain: sanitizeMetadataText(item.recordGrain, 500) })),
    fields: classified.map((item) => ({ id: item.id, objectId: item.businessObjectId, name: sanitizeMetadataText(item.businessName, 255), column: sanitizeMetadataText(item.physicalColumnName, 128), description: sanitizeMetadataText(item.description, 500), type: item.businessType, declaredRole: item.fieldRole, analyticalClassification: item.classification, aggregation: item.aggregationRule, unit: item.unit, profile: item.profile ? { ...item.profile, sampleValues: item.profile.sampleValues.map((value) => sanitizeMetadataText(value, 120)) } : null, excludedFromKpis: item.exclusionReasons })),
    eligibleMeasureFieldIds: eligible.map((item) => item.id), usefulDimensionFieldIds: dimensions.map((item) => item.id), existingKpis: existing.map((item) => ({ code: item.code, name: sanitizeMetadataText(item.name, 255) })), profilingWarnings,
  };
  reportProgress?.({ stage: "GENERATING_CANDIDATES", label: "Generating KPI candidates", detail: "AI is evaluating business meaning, useful combinations, evidence, and limitations.", percent: 58 });
  let generated: unknown = null;
  let generationMode: "AI" | "RULE_BASED" | "TIMEOUT_FALLBACK" | "PROVIDER_FALLBACK" = aiConfig() ? "AI" : "RULE_BASED";
  try {
    generated = await requestStructuredAi(`You are an enterprise business intelligence analyst specializing in Oracle and IFS ERP data. Analyze the supplied table metadata and sampled data profiles before proposing KPIs. First determine the business process, row grain, and primary entities. Classify fields as identifier, status dimension, categorical dimension, date dimension, numeric measure, monetary measure, duration measure, technical metadata, or unusable. Do not generate KPIs from column names alone. Exclude fields marked by the server because they are all-null, all-zero, constant, zero-variance, at least 98% null, technical, unavailable, or non-aggregatable identifiers. STATE, MCH_CODE_DESCRIPTION, and other categorical fields are dimensions, never numeric KPIs. Propose only KPIs supported by available and varying data and never invent unavailable fields or formulas. Prefer meaningful combinations such as ratios when both required measures exist over one KPI per column. For Active Work Order data, prioritize work-order volume, status/backlog, aging, overdue work, equipment workload, repeated maintenance, completion performance, and planned-versus-actual effort or cost only when supported. Return JSON with {analysis,kpis}. analysis contains businessProcess,rowGrain,importantEntities,recommendedDimensions,recommendedMeasures,businessQuestions,recommendedVisualizations,dataQualityWarnings. Each KPI contains code,name,description,businessObjective,businessQuestion,fieldId,aggregation,optional denominatorFieldId and denominatorAggregation,measureType,unit,recommendedVisualization,usefulDimensionFieldIds,confidenceScore,evidence, and warnings. Use only supplied field IDs.`, safeContext);
  } catch (error) {
    if (!(error instanceof HttpError) || !["AI_TIMEOUT", "AI_REQUEST_FAILED"].includes(error.code)) throw error;
    generationMode = error.code === "AI_TIMEOUT" ? "TIMEOUT_FALLBACK" : "PROVIDER_FALLBACK";
    const warning = error.code === "AI_TIMEOUT" ? "AI response exceeded the time limit; governed rule-based KPI candidates were used." : "AI provider was unavailable; governed rule-based KPI candidates were used.";
    profilingWarnings.push(warning);
    reportProgress?.({ stage: "USING_FALLBACK", label: "Continuing with governed fallback", detail: warning, percent: 72 });
  }
  const fallback = fallbackKpis(eligible);
  const normalizedFallback = normalizeKpiSuggestions(fallback, eligible);
  let suggestions;
  try {
    const normalized = normalizeKpiSuggestions(generated ?? fallback, eligible);
    suggestions = kpiSuggestionSchema.parse(normalized.kpis.length ? normalized : normalizedFallback).kpis;
  } catch {
    suggestions = kpiSuggestionSchema.parse(normalizedFallback).kpis;
  }
  reportProgress?.({ stage: "VALIDATING_CANDIDATES", label: "Validating KPI candidates", detail: "Checking field IDs, formula types, dimensions, duplicate names, and governance rules.", percent: 80 });
  const allowed = new Map(eligible.map((field) => [field.id, field]));
  const dimensionMap = new Map(dimensions.map((field) => [field.id, field]));
  const usedCodes = new Set(existing.map((item) => item.code));
  const usedNames = new Set(existing.map((item) => item.name.toLowerCase()));
  const created = [];
  reportProgress?.({ stage: "SAVING_DRAFTS", label: "Saving governed drafts", detail: `Creating up to ${suggestions.length} reviewable KPI drafts with evidence and warnings.`, percent: 88 });
  for (const suggestion of suggestions) {
    const field = allowed.get(suggestion.fieldId);
    if (!field) continue;
    const fieldProfile = field.profile!;
    const denominator = suggestion.denominatorFieldId ? allowed.get(suggestion.denominatorFieldId) : undefined;
    const usableDenominator = denominator?.businessObjectId === field.businessObjectId ? denominator : undefined;
    const countOnly = field.fieldRole === "IDENTIFIER" || !["NUMBER", "CURRENCY", "PERCENTAGE", "DURATION", "QUANTITY"].includes(field.businessType);
    const aggregation = countOnly ? (suggestion.aggregation === "COUNT" ? "COUNT" : "COUNT_DISTINCT") : suggestion.aggregation;
    const baseCode = safeCode(suggestion.code);
    let code = baseCode;
    let suffix = 2;
    while (usedCodes.has(code)) code = `${baseCode.slice(0, 76)}_${suffix++}`;
    if (usedNames.has(suggestion.name.toLowerCase())) continue;
    const measureType = usableDenominator ? "RATIO" as const : aggregation.startsWith("COUNT") ? "COUNT" as const : aggregation === "SUM" ? "ADDITIVE" as const : "NON_ADDITIVE" as const;
    const usefulDimensions = suggestion.usefulDimensionFieldIds.map((id) => dimensionMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const evidence = suggestion.evidence.length ? `Evidence: ${suggestion.evidence.join("; ")}` : `Evidence: ${fieldProfile.nonNullCount}/${fieldProfile.sampleSize} sampled rows are populated with ${fieldProfile.distinctCount} distinct values.`;
    const warnings = [...suggestion.warnings, ...(usableDenominator ? [] : suggestion.denominatorFieldId ? ["Requested ratio denominator was outside the same governed business object and was omitted."] : []), ...profilingWarnings];
    const description = [suggestion.description, evidence, usefulDimensions.length ? `Useful dimensions: ${usefulDimensions.map((item) => item.businessName).join(", ")}` : "", warnings.length ? `Limitations: ${warnings.join("; ")}` : ""].filter(Boolean).join("\n\n");
    const formulaAst = usableDenominator ? { type: "ratio" as const, numerator: { type: "aggregate" as const, function: aggregation, expression: { type: "field" as const, businessFieldId: field.id } }, denominator: { type: "aggregate" as const, function: suggestion.denominatorAggregation ?? "SUM" as const, expression: { type: "field" as const, businessFieldId: usableDenominator.id } } } : { type: "aggregate" as const, function: aggregation, expression: { type: "field" as const, businessFieldId: field.id } };
    const dateDimension = usefulDimensions.find((item) => item.classification === "date_dimension" && item.businessObjectId === field.businessObjectId);
    const kpi = await createKpi({ modelId, code, name: sanitizeMetadataText(suggestion.name, 255), description: sanitizeMetadataText(description, 1000), businessObjective: sanitizeMetadataText(suggestion.businessObjective, 1000), businessQuestion: sanitizeMetadataText(suggestion.businessQuestion, 1000), tags: ["AI_DRAFT", `AI_CONFIDENCE_${Math.round(suggestion.confidenceScore)}`], measureType, formulaAst, nullHandling: "IGNORE", divisionByZeroHandling: "NULL", decimalPrecision: 2, unit: suggestion.unit ?? field.unit ?? undefined, defaultDateFieldId: dateDimension?.id, recommendedVisualization: suggestion.recommendedVisualization ?? "KPI card" }, user);
    created.push(kpi);
    usedCodes.add(code);
    usedNames.add(suggestion.name.toLowerCase());
  }
  if (!created.length) throw new HttpError(409, "AI did not produce any new KPI drafts after governance checks", "NO_NEW_KPIS");
  const rawAnalysis = generated && typeof generated === "object" ? ((generated as Record<string, unknown>).analysis ?? generated) : {};
  const parsedAnalysis = kpiAnalysisSchema.safeParse(rawAnalysis);
  const analysis = { ...(parsedAnalysis.success ? parsedAnalysis.data : { businessProcess: model.description || model.name, rowGrain: objects.map((item) => item.recordGrain).filter(Boolean).join("; "), importantEntities: objects.map((item) => item.businessName), recommendedDimensions: dimensions.slice(0, 12).map((item) => item.businessName), recommendedMeasures: eligible.slice(0, 12).map((item) => item.businessName), businessQuestions: created.map((item) => item.businessQuestion).filter((item): item is string => Boolean(item)), recommendedVisualizations: created.map((item) => item.recommendedVisualization).filter((item): item is string => Boolean(item)), dataQualityWarnings: profilingWarnings }), excludedColumns: classified.filter((item) => item.exclusionReasons.length).map((item) => ({ field: item.businessName, column: item.physicalColumnName, classification: item.classification, reasons: item.exclusionReasons })).slice(0, 80) };
  return { createdCount: created.length, checkedFieldCount: fields.length, profiledFieldCount: profiles.size, eligibleFieldCount: eligible.length, excludedFieldCount: classified.filter((item) => item.exclusionReasons.length).length, skippedEmptyFieldCount: classified.filter((item) => item.exclusionReasons.some((reason) => reason.includes("null"))).length, generationMode, analysis, kpis: created.map((item) => ({ id: item.id, code: item.code, name: item.name, status: item.status })) };
}
