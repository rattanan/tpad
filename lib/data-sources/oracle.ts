import { createHash } from "node:crypto";
import type { Connection, Pool } from "oracledb";
import { decryptCredential } from "./credentials";

export type OracleSettings = { id?: string; host: string; port: number; connectionMode?: "SERVICE_NAME" | "SID" | "CONNECTION_STRING"; connectionString?: string | null; serviceName?: string | null; sid?: string | null; username: string; encryptedPassword: string; passwordIv: string; passwordAuthTag: string; passwordKeyVersion: string; connectionTimeoutSeconds: number; queryTimeoutSeconds: number };
const pools = new Map<string, Promise<Pool>>();
const globalPools = globalThis as unknown as { oracleDataSourcePools?: Map<string, Promise<Pool>> };
const poolRegistry = globalPools.oracleDataSourcePools ?? pools;
if (process.env.NODE_ENV !== "production") globalPools.oracleDataSourcePools = poolRegistry;
const activeKeys = new Map<string, string>();

function connectString(s: OracleSettings) {
  if (s.connectionMode === "CONNECTION_STRING" && s.connectionString) return s.connectionString;
  if (s.connectionMode === "SID") return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${s.host})(PORT=${s.port}))(CONNECT_DATA=(SID=${s.sid})))`;
  return `${s.host}:${s.port}/${s.serviceName}`;
}
function poolKey(s: OracleSettings) { return createHash("sha256").update([s.id, s.host, s.port, s.connectionMode, s.serviceName, s.sid, s.username, s.encryptedPassword].join("|")).digest("hex"); }
async function driver() { return (await import("oracledb")).default; }
async function getPool(settings: OracleSettings) {
  const key = poolKey(settings); const sourceKey = settings.id; if (sourceKey) { const previousKey = activeKeys.get(sourceKey); if (previousKey && previousKey !== key) { const previous = poolRegistry.get(previousKey); poolRegistry.delete(previousKey); void previous?.then((item) => item.close(0)).catch(() => undefined); } activeKeys.set(sourceKey, key); } let pool = poolRegistry.get(key);
  if (!pool) {
    pool = driver().then((oracle) => oracle.createPool({ user: settings.username, password: decryptCredential(settings), connectString: connectString(settings), connectTimeout: settings.connectionTimeoutSeconds, poolMin: Number(process.env.ORACLE_POOL_MIN ?? 1), poolMax: Number(process.env.ORACLE_POOL_MAX ?? 5), poolIncrement: Number(process.env.ORACLE_POOL_INCREMENT ?? 1), queueTimeout: settings.connectionTimeoutSeconds * 1000 }));
    poolRegistry.set(key, pool); pool.catch(() => poolRegistry.delete(key));
  }
  return pool;
}
export async function withOracleConnection<T>(settings: OracleSettings, operation: (connection: Connection, outFormat: number) => Promise<T>) {
  const oracle = await driver(); const pool = await getPool(settings); const connection = await pool.getConnection(); connection.callTimeout = settings.queryTimeoutSeconds * 1000;
  try { return await operation(connection, oracle.OUT_FORMAT_OBJECT); } finally { await connection.close(); }
}
export function oracleSafeError(error: unknown) {
  const source = error as { message?: string; code?: string }; const message = source?.message ?? "Unknown error"; const code = source?.code?.match(/ORA-\d{5}/)?.[0] ?? message.match(/ORA-\d{5}/)?.[0] ?? "ORACLE_ERROR";
  const categories: Record<string, { category: string; hint: string }> = {
    "ORA-01017": { category: "AUTHENTICATION", hint: "ตรวจสอบ Username และ Password" }, "ORA-12154": { category: "SERVICE_RESOLUTION", hint: "ตรวจสอบ Service Name หรือ Connection String" }, "ORA-12514": { category: "SERVICE_UNKNOWN", hint: "ตรวจสอบ Service Name ที่ Listener ให้บริการ" }, "ORA-12541": { category: "NO_LISTENER", hint: "ตรวจสอบ Host, Port และ Oracle Listener" }, "ORA-12170": { category: "TIMEOUT", hint: "ตรวจสอบ Network, Firewall และค่า Timeout" }, "ORA-28000": { category: "ACCOUNT_LOCKED", hint: "ติดต่อ DBA เพื่อปลดล็อกบัญชี" }, "ORA-28001": { category: "PASSWORD_EXPIRED", hint: "เปลี่ยน Password ของบัญชี Oracle" },
  };
  const mapped = categories[code] ?? { category: "CONNECTION", hint: "ตรวจสอบ Host, Port, Service Name และข้อมูลบัญชี" };
  return { code, category: mapped.category, hint: mapped.hint, message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบการตั้งค่าการเชื่อมต่อ" };
}
export async function testOracleConnection(settings: OracleSettings) {
  const started = Date.now();
  try {
    return await withOracleConnection(settings, async (connection, outFormat) => {
      const result = await connection.execute("SELECT USER AS CURRENT_USER, SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS CURRENT_SCHEMA FROM DUAL", {}, { outFormat });
      await connection.execute("SELECT 1 AS METADATA_ALLOWED FROM ALL_OBJECTS WHERE ROWNUM <= 1", {}, { outFormat });
      const row = result.rows?.[0] ?? {};
      return { status: "CONNECTED" as const, responseTimeMs: Date.now() - started, databaseVersion: connection.oracleServerVersionString ?? null, currentUser: String(row.CURRENT_USER ?? ""), currentSchema: String(row.CURRENT_SCHEMA ?? "") };
    });
  } catch (error) { const safe = oracleSafeError(error); return { status: safe.category === "TIMEOUT" ? "TIMEOUT" as const : "FAILED" as const, responseTimeMs: Date.now() - started, ...safe }; }
}
export async function oraclePoolHealth(settings: OracleSettings) { const pool = await getPool(settings); return { connectionsOpen: pool.connectionsOpen ?? null, connectionsInUse: pool.connectionsInUse ?? null, poolMin: Number(process.env.ORACLE_POOL_MIN ?? 1), poolMax: Number(process.env.ORACLE_POOL_MAX ?? 5) }; }
