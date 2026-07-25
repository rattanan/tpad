import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { dataSources, metadataSyncRuns, users } from "../lib/db/schema";
import { createDataSource, recordConnectionTest, updateDataSource } from "../lib/data-sources/service";
import { discoverSchemas } from "../lib/data-sources/metadata";
import { testOracleConnection } from "../lib/data-sources/oracle";
import { syncMetadata } from "../lib/data-sources/sync";
import { previewTable } from "../lib/data-sources/preview";
import { dataSourceTables } from "../lib/db/schema";

async function main() {
  const password = process.env.ORACLE_TEST_PASSWORD;
  const host = process.env.ORACLE_TEST_HOST;
  const username = process.env.ORACLE_TEST_USERNAME;
  const database = process.env.ORACLE_TEST_DATABASE;
  const schema = (process.env.ORACLE_TEST_SCHEMA || username || "").toUpperCase();
  if (!password || !host || !username || !database || !schema) throw new Error("ORACLE_TEST_HOST, ORACLE_TEST_DATABASE, ORACLE_TEST_USERNAME, and ORACLE_TEST_PASSWORD are required");
  const admin = (await db.select().from(users).where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE"))).limit(1))[0];
  if (!admin) throw new Error("An active ADMIN user is required");
  const actor = { id: admin.id, fullName: admin.fullName, username: admin.username, email: admin.email, role: admin.role, mustChangePassword: admin.mustChangePassword };
  const input = { name: process.env.ORACLE_TEST_SOURCE_NAME || "Oracle read-only verification", description: "Oracle metadata source verified with SELECT-only access", environment: "UAT" as const, status: "DRAFT" as const, host, port: Number(process.env.ORACLE_TEST_PORT || 1521), connectionMode: "SERVICE_NAME" as const, serviceName: database, username, password, defaultSchema: schema, allowedSchemas: [schema], connectionTimeoutSeconds: 10, queryTimeoutSeconds: 30 };
  const existing = (await db.select().from(dataSources).where(and(eq(dataSources.name, input.name), eq(dataSources.environment, "UAT"))).limit(1))[0];
  let source = existing ? (await updateDataSource(existing.id, input, actor)).current : await createDataSource(input, actor);
  const meta = { requestId: randomUUID(), ipAddress: "local-verification", userAgent: "phase2-readonly-verifier", browser: "CLI", operatingSystem: process.platform, deviceType: "Server" };
  let connection = await testOracleConnection(source);
  await recordConnectionTest(source.id, actor, meta, connection);
  if (connection.status !== "CONNECTED") {
    source = (await updateDataSource(source.id, { ...input, connectionMode: "SID", sid: database }, actor)).current;
    connection = await testOracleConnection(source);
    await recordConnectionTest(source.id, actor, meta, connection);
  }
  if (connection.status !== "CONNECTED") throw new Error(`${connection.code}: ${connection.message}`);
  const schemas = await discoverSchemas(source);
  const selectedSchema = schemas.find((item) => item.schemaName === schema);
  if (!selectedSchema) throw new Error(`${schema} is not visible to this Oracle account`);
  await db.update(metadataSyncRuns).set({ status: "FAILED", progressStep: "Interrupted", completedAt: new Date(), errorCount: 1, errorSummary: "Local verification process was interrupted" }).where(and(eq(metadataSyncRuns.dataSourceId, source.id), eq(metadataSyncRuns.status, "RUNNING")));
  const run = await syncMetadata(source.id, "FULL", actor, meta);
  const firstTable = (await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.dataSourceId, source.id), eq(dataSourceTables.status, "ACTIVE"), eq(dataSourceTables.isIncluded, true))).limit(1))[0];
  const preview = firstTable ? await previewTable(source.id, firstTable.id, 1) : null;
  console.log(JSON.stringify({ dataSourceId: source.id, connection: { status: connection.status, databaseVersion: connection.databaseVersion, currentUser: connection.currentUser, currentSchema: connection.currentSchema, responseTimeMs: connection.responseTimeMs }, schema: selectedSchema, sync: { status: run.status, tablesFound: run.tablesFound, viewsFound: run.viewsFound, columnsFound: run.columnsFound, primaryKeysFound: run.primaryKeysFound, foreignKeysFound: run.foreignKeysFound, relationshipsFound: run.relationshipsFound, newObjects: run.newObjects, updatedObjects: run.updatedObjects, missingObjects: run.missingObjects, durationMs: run.durationMs }, preview: preview ? { table: `${firstTable.schemaName}.${firstTable.tableName}`, requestedRows: 1, returnedRows: preview.rows.length, returnedColumns: preview.columns.length } : null }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Oracle verification failed"); process.exitCode = 1; }).finally(async () => pool.end());
