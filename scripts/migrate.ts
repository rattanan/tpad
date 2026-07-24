import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection({ uri, multipleStatements: true, timezone: "Z" });
  try {
    const sql = await readFile(resolve("drizzle/0000_phase1_auth.sql"), "utf8");
    await connection.query(sql);
    console.log("Phase 1 database migration completed.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exit(1);
});
