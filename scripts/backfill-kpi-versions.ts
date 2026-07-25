import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { kpiDefinitions, kpiDefinitionVersions } from "../lib/db/schema";

async function main() {
  const rows = await db.select().from(kpiDefinitions).where(inArray(kpiDefinitions.status, ["APPROVED", "CERTIFIED"]));
  let created = 0;
  for (const kpi of rows) {
    const exists = await db.select({ id: kpiDefinitionVersions.id }).from(kpiDefinitionVersions).where(and(eq(kpiDefinitionVersions.kpiId, kpi.id), eq(kpiDefinitionVersions.versionNumber, kpi.version))).limit(1);
    if (exists.length) continue;
    await db.insert(kpiDefinitionVersions).values({ id: randomUUID(), kpiId: kpi.id, versionNumber: kpi.version, status: kpi.status === "CERTIFIED" ? "CERTIFIED" : "APPROVED", snapshotJson: JSON.stringify(kpi), changeReason: kpi.changeReason, approvedBy: kpi.approvedBy, approvedAt: kpi.approvalDate, createdBy: kpi.approvedBy || kpi.createdBy, createdAt: kpi.approvalDate || kpi.createdAt });
    created += 1;
  }
  console.log(`KPI version backfill completed: ${created} snapshots created.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Backfill failed"); process.exitCode = 1; }).finally(async () => pool.end());
