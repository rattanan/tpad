import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection({ uri, multipleStatements: true, timezone: "Z" });
  try {
    await connection.query("CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(190) NOT NULL PRIMARY KEY, applied_at datetime(3) NOT NULL)");
    for (const file of ["0000_phase1_auth.sql", "0001_phase2_data_sources.sql", "0002_phase2_metadata.sql", "0003_phase2_indexes.sql", "0004_phase2_key_rotation.sql", "0005_phase2_sensitivity_suggestions.sql", "0006_phase3_business_context.sql", "0007_phase4_dashboards.sql", "0008_kpi_version_snapshots.sql", "0009_phase5_published_portal.sql"]) {
      const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT name FROM schema_migrations WHERE name = ? LIMIT 1", [file]);
      if (rows.length) continue;
      await connection.beginTransaction();
      try { await connection.query(await readFile(resolve("drizzle", file), "utf8")); await connection.query("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [file, new Date()]); await connection.commit(); }
      catch (error) { await connection.rollback(); throw error; }
    }
    console.log("Database migrations completed.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exit(1);
});
