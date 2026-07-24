import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { mysqlPool?: mysql.Pool };

function createPool() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is required");
  return mysql.createPool({ uri, connectionLimit: 10, timezone: "Z", enableKeepAlive: true });
}

export const pool = globalForDb.mysqlPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.mysqlPool = pool;
export const db = drizzle({ client: pool, schema, mode: "default" });
