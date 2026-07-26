import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { businessFields, businessObjects, kpiDefinitions } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { assertEditable, requireBusinessContextPermission } from "./permissions";
import { createKpi, requireModel, updateBusinessField } from "./service";
import { sanitizeMetadataText } from "./security";

const descriptionSchema = z.object({ description: z.string().trim().min(10).max(600) }).strict();
const kpiSuggestionSchema = z.object({ kpis: z.array(z.object({
  code: z.string().trim().max(80), name: z.string().trim().min(2).max(255), description: z.string().trim().min(10).max(1000),
  businessObjective: z.string().trim().max(1000).optional(), businessQuestion: z.string().trim().max(1000).optional(), fieldId: z.string().uuid(),
  aggregation: z.enum(["SUM", "AVERAGE", "COUNT", "COUNT_DISTINCT", "MINIMUM", "MAXIMUM"]), measureType: z.enum(["ADDITIVE", "SEMI_ADDITIVE", "NON_ADDITIVE", "RATIO", "COUNT"]),
  unit: z.string().trim().max(80).optional(), recommendedVisualization: z.string().trim().max(80).optional(),
}).strict()).min(1).max(8) }).strict();

type AiBody = { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };

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
  const timer = setTimeout(() => controller.abort(), 45_000);
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
    throw new HttpError(502, error instanceof Error && error.name === "AbortError" ? "AI assistance timed out" : "AI assistance is temporarily unavailable", "AI_REQUEST_FAILED");
  } finally { clearTimeout(timer); }
}

function fallbackDescription(field: { businessName: string; businessType: string; fieldRole: string }, objectName: string) {
  const role = field.fieldRole.replaceAll("_", " ").toLowerCase();
  return `${field.businessName} represents the ${field.businessType.toLowerCase()} value used as a ${role} for ${objectName}.`;
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
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return /^[A-Z]/.test(code) ? code : `KPI_${code}`.slice(0, 80);
}

function fallbackKpis(fields: Array<{ id: string; businessName: string; businessType: string; fieldRole: string; aggregationRule: string; unit: string | null }>) {
  return { kpis: fields.slice(0, 6).map((field) => {
    const count = field.fieldRole === "IDENTIFIER" || field.businessType === "IDENTIFIER";
    return { code: safeCode(`${count ? "COUNT" : field.aggregationRule === "NONE" ? "SUM" : field.aggregationRule}_${field.businessName}`), name: `${count ? "Count of" : "Total"} ${field.businessName}`, description: `${count ? "Count of distinct" : "Aggregated total for"} ${field.businessName} across the governed Business Context.`, businessObjective: `Monitor ${field.businessName} using governed field definitions.`, businessQuestion: count ? `How many distinct ${field.businessName} records are there?` : `What is the total ${field.businessName}?`, fieldId: field.id, aggregation: count ? "COUNT_DISTINCT" as const : "SUM" as const, measureType: count ? "COUNT" as const : "ADDITIVE" as const, unit: field.unit ?? undefined, recommendedVisualization: "KPI card" };
  }) };
}

export async function generateDraftKpisWithAi(modelId: string, user: AuthenticatedUser) {
  const model = await requireModel(modelId);
  await requireBusinessContextPermission(user, model.dataSourceId, "KPI_CREATE");
  assertEditable(model.status);
  const [objects, fields, existing] = await Promise.all([
    db.select({ id: businessObjects.id, businessName: businessObjects.businessName, description: businessObjects.description, recordGrain: businessObjects.recordGrain }).from(businessObjects).where(and(eq(businessObjects.modelId, modelId), isNull(businessObjects.deletedAt))).orderBy(asc(businessObjects.businessName)),
    db.select({ id: businessFields.id, businessObjectId: businessFields.businessObjectId, businessName: businessFields.businessName, description: businessFields.description, businessType: businessFields.businessType, fieldRole: businessFields.fieldRole, aggregationRule: businessFields.aggregationRule, unit: businessFields.unit }).from(businessFields).where(and(eq(businessFields.modelId, modelId), eq(businessFields.aiUsageAllowed, true), eq(businessFields.sensitivityClassification, "NONE"), isNull(businessFields.deletedAt))).orderBy(asc(businessFields.businessName)),
    db.select({ code: kpiDefinitions.code, name: kpiDefinitions.name }).from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, modelId), isNull(kpiDefinitions.deletedAt))),
  ]);
  const eligible = fields.filter((field) => field.fieldRole === "MEASURE" || field.fieldRole === "IDENTIFIER");
  if (!eligible.length) throw new HttpError(409, "No eligible Measure or Identifier fields are available for KPI generation", "NO_ELIGIBLE_FIELDS");
  const safeContext = { model: { name: sanitizeMetadataText(model.name, 190), description: sanitizeMetadataText(model.description, 500) }, objects: objects.map((item) => ({ id: item.id, name: sanitizeMetadataText(item.businessName, 255), description: sanitizeMetadataText(item.description, 500), recordGrain: sanitizeMetadataText(item.recordGrain, 500) })), fields: eligible.map((item) => ({ id: item.id, objectId: item.businessObjectId, name: sanitizeMetadataText(item.businessName, 255), description: sanitizeMetadataText(item.description, 500), type: item.businessType, role: item.fieldRole, aggregation: item.aggregationRule, unit: item.unit })), existingKpis: existing.map((item) => ({ code: item.code, name: sanitizeMetadataText(item.name, 255) })) };
  const generated = await requestStructuredAi("Create 1-8 useful Draft KPI definitions from the supplied governed Business Context. Use only listed field IDs. Prefer MEASURE fields; use COUNT_DISTINCT for identifiers. Do not invent SQL, fields, data, targets, or results. Return JSON with key kpis; every KPI must contain code, name, description, businessObjective, businessQuestion, fieldId, aggregation, measureType, optional unit, and recommendedVisualization.", safeContext);
  const suggestions = kpiSuggestionSchema.parse(generated ?? fallbackKpis(eligible)).kpis;
  const allowed = new Map(eligible.map((field) => [field.id, field]));
  const usedCodes = new Set(existing.map((item) => item.code));
  const usedNames = new Set(existing.map((item) => item.name.toLowerCase()));
  const created = [];
  for (const suggestion of suggestions) {
    const field = allowed.get(suggestion.fieldId);
    if (!field) continue;
    const countOnly = field.fieldRole === "IDENTIFIER" || !["NUMBER", "CURRENCY", "PERCENTAGE", "DURATION", "QUANTITY"].includes(field.businessType);
    const aggregation = countOnly ? (suggestion.aggregation === "COUNT" ? "COUNT" : "COUNT_DISTINCT") : suggestion.aggregation;
    const baseCode = safeCode(suggestion.code);
    let code = baseCode;
    let suffix = 2;
    while (usedCodes.has(code)) code = `${baseCode.slice(0, 76)}_${suffix++}`;
    if (usedNames.has(suggestion.name.toLowerCase())) continue;
    const measureType = aggregation.startsWith("COUNT") ? "COUNT" as const : aggregation === "SUM" ? "ADDITIVE" as const : "NON_ADDITIVE" as const;
    const kpi = await createKpi({ modelId, code, name: sanitizeMetadataText(suggestion.name, 255), description: sanitizeMetadataText(suggestion.description, 1000), businessObjective: sanitizeMetadataText(suggestion.businessObjective, 1000), businessQuestion: sanitizeMetadataText(suggestion.businessQuestion, 1000), tags: ["AI_DRAFT"], measureType, formulaAst: { type: "aggregate", function: aggregation, expression: { type: "field", businessFieldId: field.id } }, nullHandling: "IGNORE", divisionByZeroHandling: "NULL", decimalPrecision: 2, unit: suggestion.unit ?? field.unit ?? undefined, recommendedVisualization: suggestion.recommendedVisualization ?? "KPI card" }, user);
    created.push(kpi);
    usedCodes.add(code);
    usedNames.add(suggestion.name.toLowerCase());
  }
  if (!created.length) throw new HttpError(409, "AI did not produce any new KPI drafts after governance checks", "NO_NEW_KPIS");
  return { createdCount: created.length, kpis: created.map((item) => ({ id: item.id, code: item.code, name: item.name, status: item.status })) };
}
