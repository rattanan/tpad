import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { businessContextModels, businessContextModelVersions, businessFields, businessGlossaryTerms, businessObjects, businessRelationships, kpiDefinitions } from "../lib/db/schema";

async function main() {
  const modelId = process.env.TARGET_BUSINESS_CONTEXT_ID;
  if (!modelId) throw new Error("TARGET_BUSINESS_CONTEXT_ID is required");
  const model = (await db.select().from(businessContextModels).where(and(eq(businessContextModels.id, modelId), isNull(businessContextModels.deletedAt))).limit(1))[0];
  if (!model || model.status !== "PUBLISHED") throw new Error("Target must be an existing published Business Context Model");
  const actorId = model.publishedBy || model.approvedBy || model.createdBy;
  const timestamp = new Date();
  const [pendingObjects, pendingFields] = await Promise.all([
    db.select({ id: businessObjects.id }).from(businessObjects).where(and(eq(businessObjects.modelId, modelId), inArray(businessObjects.approvalStatus, ["DRAFT", "SUGGESTED", "IN_REVIEW"]), isNull(businessObjects.deletedAt))),
    db.select({ id: businessFields.id }).from(businessFields).where(and(eq(businessFields.modelId, modelId), inArray(businessFields.approvalStatus, ["DRAFT", "SUGGESTED", "IN_REVIEW"]), isNull(businessFields.deletedAt))),
  ]);
  if (!pendingObjects.length && !pendingFields.length) { console.log("No Business Object or Field approval states require repair."); return; }
  await db.transaction(async (tx) => {
    await tx.update(businessObjects).set({ approvalStatus: "APPROVED", updatedAt: timestamp, updatedBy: actorId }).where(and(eq(businessObjects.modelId, modelId), inArray(businessObjects.approvalStatus, ["DRAFT", "SUGGESTED", "IN_REVIEW"]), isNull(businessObjects.deletedAt)));
    await tx.update(businessFields).set({ approvalStatus: "APPROVED", updatedAt: timestamp, updatedBy: actorId }).where(and(eq(businessFields.modelId, modelId), inArray(businessFields.approvalStatus, ["DRAFT", "SUGGESTED", "IN_REVIEW"]), isNull(businessFields.deletedAt)));
  });
  const [objects, fields, relationships, kpis, glossary] = await Promise.all([
    db.select().from(businessObjects).where(and(eq(businessObjects.modelId, modelId), isNull(businessObjects.deletedAt))),
    db.select().from(businessFields).where(and(eq(businessFields.modelId, modelId), isNull(businessFields.deletedAt))),
    db.select().from(businessRelationships).where(and(eq(businessRelationships.modelId, modelId), isNull(businessRelationships.deletedAt))),
    db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, modelId), isNull(kpiDefinitions.deletedAt))),
    db.select().from(businessGlossaryTerms).where(and(eq(businessGlossaryTerms.modelId, modelId), isNull(businessGlossaryTerms.deletedAt))),
  ]);
  const previous = (await db.select().from(businessContextModelVersions).where(eq(businessContextModelVersions.modelId, modelId)).orderBy(desc(businessContextModelVersions.versionNumber)).limit(1))[0];
  const versionNumber = Math.max(model.version, previous?.versionNumber || 0) + 1;
  await db.transaction(async (tx) => {
    await tx.insert(businessContextModelVersions).values({ id: randomUUID(), modelId, parentVersionId: previous?.id, versionNumber, changeSummary: "Corrected child approval states after Data Steward approval", status: "PUBLISHED", objectsSnapshot: JSON.stringify(objects), fieldsSnapshot: JSON.stringify(fields), relationshipsSnapshot: JSON.stringify(relationships), kpisSnapshot: JSON.stringify(kpis), glossarySnapshot: JSON.stringify(glossary), approvedBy: model.approvedBy || actorId, publishedBy: actorId, publishedAt: timestamp, createdBy: actorId, createdAt: timestamp });
    await tx.update(businessContextModels).set({ version: versionNumber, updatedAt: timestamp, updatedBy: actorId }).where(eq(businessContextModels.id, modelId));
  });
  console.log(`Repaired ${pendingObjects.length} Business Objects and ${pendingFields.length} Business Fields; published corrective version ${versionNumber}.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Repair failed"); process.exitCode = 1; }).finally(async () => pool.end());
