import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessContextModels, businessFields, businessObjects, businessRelationships, businessRelationshipValidationResults } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getDataSource } from "@/lib/data-sources/service";
import { withOracleConnection } from "@/lib/data-sources/oracle";
import { HttpError } from "@/lib/http";
import { assertEditable, requireBusinessContextPermission } from "./permissions";
import { validateRelationshipDefinition } from "./relationship-rules";
export { detectCircularRelationships, validateRelationshipDefinition } from "./relationship-rules";

function oracleIdentifier(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(value)) throw new HttpError(400, "Unsafe Oracle identifier", "UNSAFE_IDENTIFIER");
  return `"${value.toUpperCase()}"`;
}

export async function validateRelationship(id: string, user: AuthenticatedUser) {
  const relationship = (await db.select().from(businessRelationships).where(and(eq(businessRelationships.id, id), isNull(businessRelationships.deletedAt))).limit(1))[0];
  if (!relationship) throw new HttpError(404, "Relationship not found", "NOT_FOUND");
  const model = (await db.select().from(businessContextModels).where(eq(businessContextModels.id, relationship.modelId)).limit(1))[0]; if (!model) throw new HttpError(404, "Model not found", "NOT_FOUND");
  await requireBusinessContextPermission(user, model.dataSourceId, "BUSINESS_RELATIONSHIP_VALIDATE"); assertEditable(model.status);
  const [sourceObject, targetObject, sourceField, targetField, edges] = await Promise.all([
    db.select().from(businessObjects).where(eq(businessObjects.id, relationship.sourceObjectId)).then((rows) => rows[0]),
    db.select().from(businessObjects).where(eq(businessObjects.id, relationship.targetObjectId)).then((rows) => rows[0]),
    db.select().from(businessFields).where(eq(businessFields.id, relationship.sourceFieldId)).then((rows) => rows[0]),
    db.select().from(businessFields).where(eq(businessFields.id, relationship.targetFieldId)).then((rows) => rows[0]),
    db.select({ id: businessRelationships.id, sourceObjectId: businessRelationships.sourceObjectId, targetObjectId: businessRelationships.targetObjectId, cardinality: businessRelationships.cardinality }).from(businessRelationships).where(and(eq(businessRelationships.modelId, model.id), isNull(businessRelationships.deletedAt))),
  ]);
  if (!sourceObject || !targetObject || !sourceField || !targetField || [sourceObject.dataSourceId, targetObject.dataSourceId, sourceField.dataSourceId, targetField.dataSourceId].some((value) => value !== model.dataSourceId)) throw new HttpError(400, "Cross-data-source relationship blocked", "SCOPE_MISMATCH");
  const issues = validateRelationshipDefinition({ cardinality: relationship.cardinality, sourceObjectId: relationship.sourceObjectId, targetObjectId: relationship.targetObjectId, sourceSchema: sourceObject.databaseSchema, targetSchema: targetObject.databaseSchema, sourceUnique: sourceField.isUnique || sourceField.isPrimaryKey, targetUnique: targetField.isUnique || targetField.isPrimaryKey, sourceApproved: sourceField.approvalStatus === "APPROVED", targetApproved: targetField.approvalStatus === "APPROVED" }, edges);
  let metrics: Record<string, number | null> = {};
  try {
    const source = await getDataSource(model.dataSourceId); if (!source) throw new Error("Data source not found");
    const sql = `WITH s AS (SELECT ${oracleIdentifier(sourceField.physicalColumnName)} v FROM ${oracleIdentifier(sourceObject.databaseSchema)}.${oracleIdentifier(sourceObject.technicalName)} WHERE ROWNUM <= 1000), t AS (SELECT ${oracleIdentifier(targetField.physicalColumnName)} v FROM ${oracleIdentifier(targetObject.databaseSchema)}.${oracleIdentifier(targetObject.technicalName)} WHERE ROWNUM <= 1000) SELECT (SELECT COUNT(*) FROM s) source_rows, (SELECT COUNT(*) FROM t) target_rows, (SELECT COUNT(*) FROM s WHERE v IS NULL) source_nulls, (SELECT COUNT(*) FROM t WHERE v IS NULL) target_nulls, (SELECT COUNT(*) FROM s JOIN t ON s.v=t.v) matched_rows, (SELECT COUNT(*) FROM s WHERE v IS NOT NULL AND NOT EXISTS (SELECT 1 FROM t WHERE t.v=s.v)) unmatched_source, (SELECT COUNT(*) FROM t WHERE v IS NOT NULL AND NOT EXISTS (SELECT 1 FROM s WHERE s.v=t.v)) unmatched_target FROM dual`;
    const row = await withOracleConnection(source, async (connection, outFormat) => (((await connection.execute(sql, {}, { outFormat, maxRows: 1 })).rows?.[0] ?? {}) as Record<string, number>));
    const sourceRows = Number(row.SOURCE_ROWS ?? 0); const targetRows = Number(row.TARGET_ROWS ?? 0); const matched = Number(row.MATCHED_ROWS ?? 0);
    metrics = { sourceRows, targetRows, sourceNullRate: sourceRows ? Number(row.SOURCE_NULLS ?? 0) / sourceRows : 0, targetNullRate: targetRows ? Number(row.TARGET_NULLS ?? 0) / targetRows : 0, matchRate: sourceRows ? matched / sourceRows : 0, unmatchedSourceRows: Number(row.UNMATCHED_SOURCE ?? 0), unmatchedTargetRows: Number(row.UNMATCHED_TARGET ?? 0), fanOutRatio: sourceRows ? matched / sourceRows : 0 };
    if ((metrics.sourceNullRate ?? 0) > 0.2 || (metrics.targetNullRate ?? 0) > 0.2) issues.push({ ruleCode: "HIGH_NULL_RATE", severity: "WARNING", message: "A join field has more than 20% null values.", suggestedFix: "Review join keys or add an approved null-handling rule." });
    if ((metrics.fanOutRatio ?? 0) > 1.2) issues.push({ ruleCode: "FAN_OUT", severity: "WARNING", message: "The sampled join fans out and may duplicate measures.", suggestedFix: "Define grain-safe aggregation or a bridge object." });
  } catch {
    issues.push({ ruleCode: "ORACLE_PROBE_UNAVAILABLE", severity: "WARNING", message: "Static validation completed, but the bounded read-only Oracle probe could not be completed.", suggestedFix: "Check connection health and retry validation." });
  }
  if (!issues.length) issues.push({ ruleCode: "RELATIONSHIP_VALID", severity: "INFO", message: "Relationship passed static and sampled read-only validation." });
  const outcome: "FAILED" | "PASSED_WITH_WARNING" | "PASSED" = issues.some((item) => item.severity === "ERROR") ? "FAILED" : issues.some((item) => item.severity === "WARNING") ? "PASSED_WITH_WARNING" : "PASSED";
  const timestamp = new Date();
  await db.insert(businessRelationshipValidationResults).values(issues.map((issue) => ({ id: randomUUID(), relationshipId: id, modelId: model.id, dataSourceId: model.dataSourceId, result: outcome, ...issue, metrics: JSON.stringify(metrics), validatedBy: user.id, validatedAt: timestamp, createdAt: timestamp })));
  await db.update(businessRelationships).set({ validationStatus: outcome === "FAILED" ? "INVALID" : outcome === "PASSED_WITH_WARNING" ? "WARNING" : "VALID", updatedAt: timestamp, updatedBy: user.id }).where(eq(businessRelationships.id, id));
  return { outcome, issues, metrics };
}
