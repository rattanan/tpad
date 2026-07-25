import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessFields, businessObjects, businessRelationships, kpiDefinitions, kpiTestCases, kpiTestResults, kpiValidationResults } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getDataSource } from "@/lib/data-sources/service";
import { withOracleConnection } from "@/lib/data-sources/oracle";
import { HttpError } from "@/lib/http";
import { collectFormulaFieldIds, formulaNodeSchema, validateFormulaTypes, type FormulaFilter, type FormulaNode } from "./formula";
import { assertEditable, maySeeGeneratedSql, requireBusinessContextPermission } from "./permissions";
import { requireModel } from "./service";
import { assertReadOnlySql } from "./security";
export { assertReadOnlySql } from "./security";

type Field = typeof businessFields.$inferSelect;
type ObjectRow = typeof businessObjects.$inferSelect;
type BindValue = string | number | boolean | Date | null;
type CompileContext = { fields: Map<string, Field>; objects: Map<string, ObjectRow>; aliases: Map<string, string>; binds: Record<string, BindValue>; bindIndex: number };

function identifier(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(value)) throw new HttpError(400, "Unsafe Oracle identifier", "UNSAFE_IDENTIFIER");
  return `"${value.toUpperCase()}"`;
}
const fieldSql = (id: string, context: CompileContext) => { const field = context.fields.get(id); if (!field) throw new HttpError(400, `Unknown Business Field ${id}`, "INVALID_FORMULA"); const alias = context.aliases.get(field.businessObjectId); if (!alias) throw new HttpError(400, "Formula object is not reachable", "MISSING_RELATIONSHIP"); return `${alias}.${identifier(field.physicalColumnName)}`; };
const bind = (value: BindValue, context: CompileContext) => { const key = `p${++context.bindIndex}`; context.binds[key] = value; return `:${key}`; };
const comparison = (operator: string) => ({ EQ: "=", NE: "<>", GT: ">", GTE: ">=", LT: "<", LTE: "<=", IN: "IN", NOT_IN: "NOT IN", BETWEEN: "BETWEEN", IS_NULL: "IS NULL", IS_NOT_NULL: "IS NOT NULL" }[operator]);

function compileFilter(filter: FormulaFilter, context: CompileContext) {
  const column = fieldSql(filter.businessFieldId, context); const op = comparison(filter.operator); if (!op) throw new HttpError(400, "Unsupported filter operator", "INVALID_FORMULA");
  if (filter.operator === "IS_NULL" || filter.operator === "IS_NOT_NULL") return `${column} ${op}`;
  const values = filter.values ?? [];
  if ((filter.operator === "IN" || filter.operator === "NOT_IN") && values.length) return `${column} ${op} (${values.map((value) => bind(value, context)).join(", ")})`;
  if (filter.operator === "BETWEEN" && values.length === 2) return `${column} BETWEEN ${bind(values[0], context)} AND ${bind(values[1], context)}`;
  if (values.length === 1) return `${column} ${op} ${bind(values[0], context)}`;
  throw new HttpError(400, "Filter values do not match the operator", "INVALID_FILTER");
}

function compileNode(node: FormulaNode, context: CompileContext): string {
  if (node.type === "field") return fieldSql(node.businessFieldId, context);
  if (node.type === "literal") return bind(node.value, context);
  if (node.type === "arithmetic") { const op = { ADD: "+", SUBTRACT: "-", MULTIPLY: "*", DIVIDE: "/" }[node.operator]; const right = compileNode(node.right, context); return `(${compileNode(node.left, context)} ${op} ${node.operator === "DIVIDE" ? `NULLIF(${right}, 0)` : right})`; }
  if (node.type === "aggregate") { const expression = compileNode(node.expression, context); const filtered = node.filters?.length ? `CASE WHEN ${node.filters.map((item) => compileFilter(item, context)).join(" AND ")} THEN ${expression} END` : expression; return `${node.function === "AVERAGE" ? "AVG" : node.function === "MINIMUM" ? "MIN" : node.function === "MAXIMUM" ? "MAX" : node.function === "COUNT_DISTINCT" ? "COUNT" : node.function}(${node.function === "COUNT_DISTINCT" ? `DISTINCT ${filtered}` : filtered})`; }
  if (node.type === "ratio" || node.type === "percentage") return `((${compileNode(node.numerator, context)}) / NULLIF((${compileNode(node.denominator, context)}), 0)${node.type === "percentage" ? " * 100" : ""})`;
  if (node.type === "conditional") return `(CASE WHEN ${compileNode(node.condition.left, context)} ${comparison(node.condition.operator)} ${compileNode(node.condition.right, context)} THEN ${compileNode(node.whenTrue, context)} ELSE ${compileNode(node.whenFalse, context)} END)`;
  if (node.type === "date_difference") { const divisor = { DAY: 1, WEEK: 7, MONTH: 30.436875, YEAR: 365.2425 }[node.unit]; return `((${compileNode(node.end, context)} - ${compileNode(node.start, context)}) / ${divisor})`; }
  if (node.type === "period") { const date = fieldSql(node.dateFieldId, context); const expression = compileNode(node.expression, context); const predicate = node.function === "MONTH_TO_DATE" ? `${date} >= TRUNC(SYSDATE, 'MM')` : node.function === "YEAR_TO_DATE" ? `${date} >= TRUNC(SYSDATE, 'YYYY')` : node.function === "PREVIOUS_PERIOD" ? `${date} >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -1) AND ${date} < TRUNC(SYSDATE, 'MM')` : `${date} >= ADD_MONTHS(TRUNC(SYSDATE), -${Math.max(1, node.periods ?? 1)})`; return `(CASE WHEN ${predicate} THEN ${expression} END)`; }
  if (node.type === "growth_rate") return `((${compileNode(node.current, context)} - ${compileNode(node.comparison, context)}) / NULLIF(${compileNode(node.comparison, context)}, 0) * 100)`;
  if (node.type === "variance") return `(${compileNode(node.current, context)} - ${compileNode(node.comparison, context)})`;
  if (node.type === "custom") { const allowed = new Set(["ABS", "ROUND", "COALESCE"]); if (!allowed.has(node.function)) throw new HttpError(400, "Custom function is not allowlisted", "INVALID_FORMULA"); return `${node.function}(${node.arguments.map((item) => compileNode(item, context)).join(", ")})`; }
  throw new HttpError(400, "Unsupported formula node", "INVALID_FORMULA");
}

export async function compileKpi(kpi: typeof kpiDefinitions.$inferSelect) {
  const ast = formulaNodeSchema.parse(JSON.parse(kpi.formulaAst)); const fieldIds = [...collectFormulaFieldIds(ast)]; const fields = fieldIds.length ? await db.select().from(businessFields).where(and(inArray(businessFields.id, fieldIds), isNull(businessFields.deletedAt))) : [];
  const objectIds = [...new Set(fields.map((field) => field.businessObjectId))]; const objectsRows = objectIds.length ? await db.select().from(businessObjects).where(and(inArray(businessObjects.id, objectIds), isNull(businessObjects.deletedAt))) : []; const relationships = await db.select().from(businessRelationships).where(and(eq(businessRelationships.modelId, kpi.modelId), isNull(businessRelationships.deletedAt)));
  const joinFieldIds = [...new Set(relationships.filter((relationship) => relationship.approvalStatus === "APPROVED").flatMap((relationship) => [relationship.sourceFieldId, relationship.targetFieldId]).filter((fieldId) => !fieldIds.includes(fieldId)))];
  const joinFields = joinFieldIds.length ? await db.select().from(businessFields).where(and(inArray(businessFields.id, joinFieldIds), isNull(businessFields.deletedAt))) : [];
  const fieldsMap = new Map([...fields, ...joinFields].map((field) => [field.id, field])); const objects = new Map(objectsRows.map((object) => [object.id, object]));
  const registeredAliases = new Map<string, string>(); const root = objects.get(objectIds[0]); if (!root) throw new HttpError(400, "KPI has no source object", "INVALID_FORMULA"); registeredAliases.set(root.id, "t0"); const joined = new Set([root.id]); const joins: string[] = []; let aliasIndex = 1;
  while (joined.size < objectIds.length) { const rel = relationships.find((item) => item.approvalStatus === "APPROVED" && ((joined.has(item.sourceObjectId) && objectIds.includes(item.targetObjectId) && !joined.has(item.targetObjectId)) || (joined.has(item.targetObjectId) && objectIds.includes(item.sourceObjectId) && !joined.has(item.sourceObjectId)))); if (!rel) throw new HttpError(400, "No approved relationship path connects all KPI objects", "MISSING_RELATIONSHIP"); const forward = joined.has(rel.sourceObjectId); const existingId = forward ? rel.sourceObjectId : rel.targetObjectId; const nextId = forward ? rel.targetObjectId : rel.sourceObjectId; const ef = fieldsMap.get(forward ? rel.sourceFieldId : rel.targetFieldId); const nf = fieldsMap.get(forward ? rel.targetFieldId : rel.sourceFieldId); const next = objects.get(nextId); if (!ef || !nf || !next) throw new HttpError(400, "Relationship metadata is incomplete", "MISSING_RELATIONSHIP"); const alias = `t${aliasIndex++}`; registeredAliases.set(nextId, alias); joins.push(`${rel.joinType} JOIN ${identifier(next.databaseSchema)}.${identifier(next.technicalName)} ${alias} ON ${registeredAliases.get(existingId)}.${identifier(ef.physicalColumnName)} = ${alias}.${identifier(nf.physicalColumnName)}`); joined.add(nextId); }
  const context: CompileContext = { fields: fieldsMap, objects, aliases: registeredAliases, binds: {}, bindIndex: 0 }; const expression = compileNode(ast, context); const fromSql = `${identifier(root.databaseSchema)}.${identifier(root.technicalName)} t0 ${joins.join(" ")}`.trim(); const sql = assertReadOnlySql(`SELECT ${expression} AS KPI_VALUE FROM ${fromSql} FETCH FIRST 100 ROWS ONLY`);
  return { ast, fields, fieldsMap, objects: objectsRows, relationships, sql, binds: context.binds, expression, fromSql, aliases: registeredAliases };
}

export async function validateKpi(kpiId: string, user: AuthenticatedUser) {
  const kpi = (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.id, kpiId), isNull(kpiDefinitions.deletedAt))).limit(1))[0]; if (!kpi) throw new HttpError(404, "KPI not found", "NOT_FOUND"); const model = await requireModel(kpi.modelId); await requireBusinessContextPermission(user, kpi.dataSourceId, "KPI_VALIDATE"); assertEditable(model.status);
  const issues: Array<{ ruleCode: string; severity: "INFO" | "WARNING" | "ERROR"; message: string; businessObjectId?: string; businessFieldId?: string; suggestedFix?: string }> = [];
  try { const compiled = await compileKpi(kpi); validateFormulaTypes(compiled.ast, new Map(compiled.fields.map((field) => [field.id, field]))).forEach((message) => issues.push({ ruleCode: "FORMULA_TYPE", severity: "ERROR", message })); if (compiled.objects.some((object) => !object.recordGrain)) issues.push({ ruleCode: "MISSING_GRAIN", severity: "ERROR", message: "Every KPI source object must define its record grain.", suggestedFix: "Document and approve each Business Object grain." }); if (compiled.objects.some((object) => object.approvalStatus !== "APPROVED")) issues.push({ ruleCode: "UNAPPROVED_OBJECT", severity: "ERROR", message: "All KPI source objects must be approved." }); if (compiled.relationships.some((relationship) => relationship.cardinality === "MANY_TO_MANY" && relationship.approvalStatus === "APPROVED")) issues.push({ ruleCode: "MEASURE_DUPLICATION_RISK", severity: "WARNING", message: "An approved many-to-many relationship may duplicate measures.", suggestedFix: "Use a bridge or validate deduplication at the KPI grain." }); assertReadOnlySql(compiled.sql); } catch (error) { issues.push({ ruleCode: "SQL_COMPILATION", severity: "ERROR", message: error instanceof Error ? error.message : "KPI compilation failed" }); }
  if ((kpi.measureType === "RATIO" || kpi.formulaAst.includes('"type":"ratio"')) && !kpi.divisionByZeroHandling) issues.push({ ruleCode: "DIVISION_BY_ZERO", severity: "ERROR", message: "Ratio KPIs require division-by-zero handling." }); if (!kpi.nullHandling) issues.push({ ruleCode: "NULL_HANDLING", severity: "ERROR", message: "Null handling is required." }); if (kpi.dateLogic && !kpi.defaultDateFieldId) issues.push({ ruleCode: "DATE_LOGIC", severity: "ERROR", message: "Date logic requires a default date field." });
  if (!issues.length) issues.push({ ruleCode: "KPI_VALID", severity: "INFO", message: "KPI definition passed all validation rules." }); const outcome: "FAILED" | "PASSED_WITH_WARNING" | "PASSED" = issues.some((item) => item.severity === "ERROR") ? "FAILED" : issues.some((item) => item.severity === "WARNING") ? "PASSED_WITH_WARNING" : "PASSED"; const timestamp = new Date();
  await db.insert(kpiValidationResults).values(issues.map((issue) => ({ id: randomUUID(), kpiId, result: outcome, ...issue, validatedBy: user.id, validatedAt: timestamp, createdAt: timestamp })));
  if (outcome !== "FAILED") await db.update(kpiDefinitions).set({ certificationStatus: "TECHNICALLY_VALIDATED", updatedBy: user.id, updatedAt: timestamp }).where(eq(kpiDefinitions.id, kpiId)); return { outcome, issues };
}

let runningQueries = 0;
export async function testKpi(kpiId: string, input: { testCaseId?: string; name?: string; inputFilters?: unknown; expectedResult?: string; tolerance?: string; saveTestCase?: boolean; technicalValidationNotes?: string; businessValidationNotes?: string }, user: AuthenticatedUser) {
  const kpi = (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.id, kpiId), isNull(kpiDefinitions.deletedAt))).limit(1))[0]; if (!kpi) throw new HttpError(404, "KPI not found", "NOT_FOUND"); await requireBusinessContextPermission(user, kpi.dataSourceId, "KPI_TEST"); if (runningQueries >= 3) throw new HttpError(429, "KPI test concurrency limit reached", "QUERY_LIMIT");
  const compiled = await compileKpi(kpi); const source = await getDataSource(kpi.dataSourceId); if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND"); runningQueries += 1; const started = Date.now(); let testCaseId = input.testCaseId; let status: "PASSED" | "FAILED" | "ERROR" = "ERROR"; let actualResult: string | undefined; let resultPreview: unknown[] = []; let errorDetail: string | undefined;
  try { const rows = await withOracleConnection(source, async (connection, outFormat) => ((await connection.execute(compiled.sql, compiled.binds, { outFormat, maxRows: 100 })).rows ?? []) as Array<Record<string, unknown>>); const size = Buffer.byteLength(JSON.stringify(rows)); if (size > 1_000_000) throw new HttpError(413, "KPI result exceeds the 1 MB limit", "RESULT_LIMIT"); resultPreview = rows.slice(0, 100); actualResult = rows[0]?.KPI_VALUE === undefined ? undefined : String(rows[0].KPI_VALUE); const expected = input.expectedResult === undefined ? undefined : Number(input.expectedResult); const actual = actualResult === undefined ? undefined : Number(actualResult); const tolerance = Number(input.tolerance ?? 0); status = expected === undefined || actual === undefined || Number.isNaN(expected) || Number.isNaN(actual) ? "PASSED" : Math.abs(actual - expected) <= tolerance ? "PASSED" : "FAILED"; }
  catch (error) { errorDetail = error instanceof Error ? error.message.slice(0, 500) : "KPI test failed"; status = "ERROR"; }
  finally { runningQueries -= 1; }
  const timestamp = new Date(); if (input.saveTestCase && !testCaseId) { testCaseId = randomUUID(); await db.insert(kpiTestCases).values({ id: testCaseId, kpiId, name: input.name ?? `Test ${timestamp.toISOString()}`, inputFilters: JSON.stringify(input.inputFilters ?? {}), expectedResult: input.expectedResult, tolerance: input.tolerance, technicalValidationNotes: input.technicalValidationNotes, businessValidationNotes: input.businessValidationNotes, status: "ACTIVE", createdBy: user.id, updatedBy: user.id, createdAt: timestamp, updatedAt: timestamp }); }
  const expected = input.expectedResult === undefined ? undefined : Number(input.expectedResult); const actual = actualResult === undefined ? undefined : Number(actualResult); await db.insert(kpiTestResults).values({ id: randomUUID(), testCaseId, kpiId, inputFilters: JSON.stringify(input.inputFilters ?? {}), expectedResult: input.expectedResult, actualResult, difference: expected !== undefined && actual !== undefined && !Number.isNaN(expected) && !Number.isNaN(actual) ? String(actual - expected) : undefined, tolerance: input.tolerance, status, generatedSql: compiled.sql, rowCount: resultPreview.length, resultPreview: JSON.stringify(resultPreview), durationMs: Date.now() - started, errorDetail, testedBy: user.id, testedAt: timestamp, createdAt: timestamp });
  return { status, actualResult, resultPreview, durationMs: Date.now() - started, generatedSql: maySeeGeneratedSql(user) ? compiled.sql : undefined, error: errorDetail };
}
