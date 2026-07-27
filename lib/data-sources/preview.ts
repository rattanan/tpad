import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dataSourceColumns, dataSourceTables } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import { getDataSource } from "./service";
import { maskValue, type Sensitivity } from "./masking";
import { withOracleConnection } from "./oracle";
import { buildNonNullPresenceQuery } from "./presence-query";
import { summarizeColumnProfile, type ColumnProfile } from "@/lib/business-context/column-profile";
export { buildNonNullPresenceQuery } from "./presence-query";
const identifier = /^[A-Za-z][A-Za-z0-9_$#]*$/;
const quote = (value: string) => { if (!identifier.test(value)) throw new HttpError(400, "Invalid Oracle identifier", "INVALID_IDENTIFIER"); return `"${value}"`; };
const profileCache=new Map<string,{expiresAt:number;profiles:Record<string,ColumnProfile>}>();

export async function checkColumnsHaveData(dataSourceId: string, tableId: string, columnNames: string[]) {
  const source = await getDataSource(dataSourceId);
  if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND");
  const table = (await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.id, tableId), eq(dataSourceTables.dataSourceId, dataSourceId), eq(dataSourceTables.isIncluded, true), eq(dataSourceTables.status, "ACTIVE"))).limit(1))[0];
  if (!table) throw new HttpError(404, "Table is not available", "NOT_FOUND");
  const requested = [...new Set(columnNames)];
  const available = await db.select({ columnName: dataSourceColumns.columnName }).from(dataSourceColumns).where(and(eq(dataSourceColumns.tableId, tableId), eq(dataSourceColumns.isIncluded, true), eq(dataSourceColumns.status, "ACTIVE")));
  const allowed = new Set(available.map((column) => column.columnName));
  if (!requested.length || requested.some((column) => !allowed.has(column))) throw new HttpError(400, "One or more columns are not available", "INVALID_COLUMN");
  const query = buildNonNullPresenceQuery(table.schemaName, table.tableName, requested);
  const row = await withOracleConnection(source, async (connection, outFormat) => ((await connection.execute(query.sql, {}, { outFormat, maxRows: 1 })).rows?.[0] ?? {}) as Record<string, unknown>);
  return Object.fromEntries(requested.map((column, index) => [column, Number(row[query.aliases[index]] ?? 0) === 1]));
}

export async function checkTableHasData(dataSourceId: string, tableId: string) {
  const source = await getDataSource(dataSourceId);
  if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND");
  const table = (await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.id, tableId), eq(dataSourceTables.dataSourceId, dataSourceId), eq(dataSourceTables.isIncluded, true), eq(dataSourceTables.status, "ACTIVE"))).limit(1))[0];
  if (!table) throw new HttpError(404, "Table is not available", "NOT_FOUND");
  const sql = `SELECT 1 AS HAS_DATA FROM ${quote(table.schemaName)}.${quote(table.tableName)} WHERE ROWNUM <= 1`;
  return withOracleConnection(source, async (connection, outFormat) => Boolean((await connection.execute(sql, {}, { outFormat, maxRows: 1 })).rows?.length));
}

export async function profileTableColumns(dataSourceId: string, tableId: string, columnNames: string[], rowLimit = 2_000) {
  const source = await getDataSource(dataSourceId);
  if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND");
  const table = (await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.id, tableId), eq(dataSourceTables.dataSourceId, dataSourceId), eq(dataSourceTables.isIncluded, true), eq(dataSourceTables.status, "ACTIVE"))).limit(1))[0];
  if (!table) throw new HttpError(404, "Table is not available", "NOT_FOUND");
  const requested = [...new Set(columnNames)].slice(0, 120);
  const columns = await db.select({ columnName: dataSourceColumns.columnName, dataType: dataSourceColumns.dataType, sensitivityType: dataSourceColumns.sensitivityType }).from(dataSourceColumns).where(and(eq(dataSourceColumns.tableId, tableId), eq(dataSourceColumns.isIncluded, true), eq(dataSourceColumns.status, "ACTIVE")));
  const allowed = new Map(columns.filter((column) => column.sensitivityType === "NONE").map((column) => [column.columnName, column]));
  if (!requested.length || requested.some((column) => !allowed.has(column))) throw new HttpError(400, "One or more columns cannot be profiled", "INVALID_PROFILE_COLUMN");
  const select = `SELECT ${requested.map(quote).join(",")} FROM ${quote(table.schemaName)}.${quote(table.tableName)}`;
  const limit = Math.min(5_000, Math.max(100, rowLimit));
  const rows = await withOracleConnection(source, async (connection, outFormat) => {
    try { return (await connection.execute(`${select} FETCH FIRST :profileLimit ROWS ONLY`, { profileLimit: limit }, { outFormat, maxRows: limit })).rows ?? []; }
    catch (error) { if (!String((error as Error).message).includes("ORA-00933")) throw error; return (await connection.execute(`SELECT * FROM (${select}) WHERE ROWNUM <= :profileLimit`, { profileLimit: limit }, { outFormat, maxRows: limit })).rows ?? []; }
  }) as Array<Record<string, unknown>>;
  return Object.fromEntries(requested.map((columnName) => {
    const column = allowed.get(columnName)!;
    const numeric = /NUMBER|NUMERIC|DECIMAL|INTEGER|INT|FLOAT|DOUBLE|REAL|BINARY_FLOAT|BINARY_DOUBLE/i.test(column.dataType);
    return [columnName, summarizeColumnProfile(rows.map((row) => row[columnName]), numeric)];
  }));
}

export async function profileTableColumnsAggregated(dataSourceId:string,tableId:string,columnNames:string[],sampleLimit=500){
  const source=await getDataSource(dataSourceId);if(!source)throw new HttpError(404,"Data source not found","NOT_FOUND");
  const table=(await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.id,tableId),eq(dataSourceTables.dataSourceId,dataSourceId),eq(dataSourceTables.isIncluded,true),eq(dataSourceTables.status,"ACTIVE"))).limit(1))[0];if(!table)throw new HttpError(404,"Table is not available","NOT_FOUND");
  const requested=[...new Set(columnNames)].slice(0,40);const columns=await db.select({columnName:dataSourceColumns.columnName,dataType:dataSourceColumns.dataType,sensitivityType:dataSourceColumns.sensitivityType}).from(dataSourceColumns).where(and(eq(dataSourceColumns.tableId,tableId),eq(dataSourceColumns.isIncluded,true),eq(dataSourceColumns.status,"ACTIVE")));const allowed=new Map(columns.filter(column=>column.sensitivityType==="NONE").map(column=>[column.columnName,column]));if(!requested.length||requested.some(column=>!allowed.has(column)))throw new HttpError(400,"One or more columns cannot be profiled","INVALID_PROFILE_COLUMN");
  const cacheKey=`${dataSourceId}:${tableId}:${requested.join(",")}`;const cached=profileCache.get(cacheKey);if(cached&&cached.expiresAt>Date.now())return cached.profiles;
  const expressions=["COUNT(*) AS TOTAL_ROWS"];for(const [index,name] of requested.entries()){const column=allowed.get(name)!;const q=quote(name);const numeric=/NUMBER|NUMERIC|DECIMAL|INTEGER|INT|FLOAT|DOUBLE|REAL|BINARY_FLOAT|BINARY_DOUBLE/i.test(column.dataType);const text=/CHAR|VARCHAR|NCHAR|NVARCHAR/i.test(column.dataType);expressions.push(`COUNT(${q}) AS N${index}`,`COUNT(DISTINCT ${q}) AS D${index}`,numeric?`SUM(CASE WHEN ${q}=0 THEN 1 ELSE 0 END) AS Z${index}`:`0 AS Z${index}`,text?`SUM(CASE WHEN ${q} IS NOT NULL AND TRIM(${q}) IS NULL THEN 1 ELSE 0 END) AS B${index}`:`0 AS B${index}`);}
  const configured=Number(process.env.BUSINESS_CONTEXT_PROFILE_ROW_LIMIT??5_000);const profileLimit=Math.min(50_000,Math.max(500,Number.isFinite(configured)?configured:5_000));
  const sampledSource=`SELECT ${requested.map(quote).join(",")} FROM ${quote(table.schemaName)}.${quote(table.tableName)} WHERE ROWNUM <= :profileLimit`;
  const aggregateSql=`SELECT ${expressions.join(",")} FROM (${sampledSource})`;const aggregate=await withOracleConnection(source,async(connection,outFormat)=>((await connection.execute(aggregateSql,{profileLimit}, {outFormat,maxRows:1})).rows?.[0]??{}) as Record<string,unknown>);const total=Number(aggregate.TOTAL_ROWS??0);
  const sampled=await profileTableColumns(dataSourceId,tableId,requested,Math.min(2000,Math.max(100,sampleLimit)));
  const lastProfiledAt=new Date().toISOString();const profiles=Object.fromEntries(requested.map((name,index)=>{const base=sampled[name];const nonNull=Number(aggregate[`N${index}`]??0);const distinct=Number(aggregate[`D${index}`]??0);const zero=Number(aggregate[`Z${index}`]??0);const blank=Number(aggregate[`B${index}`]??0);return[name,{...base,totalRowCount:total,sampleSize:total,nonNullCount:nonNull,nonNullRatio:total?nonNull/total:0,nullRatio:total?(total-nonNull)/total:1,distinctCount:distinct,distinctRatio:nonNull?distinct/nonNull:0,zeroCount:zero,zeroRatio:nonNull?zero/nonNull:0,blankCount:blank,blankRatio:nonNull?blank/nonNull:0,profileMode:"SAMPLED_ESTIMATE" as const,lastProfiledAt}];}));
  const ttlMinutes=Math.min(1440,Math.max(1,Number(process.env.BUSINESS_CONTEXT_PROFILE_CACHE_MINUTES??30)));profileCache.set(cacheKey,{expiresAt:Date.now()+ttlMinutes*60_000,profiles});return profiles;
}

export async function previewTable(dataSourceId: string, tableId: string, rowLimit: number) {
  const source = await getDataSource(dataSourceId); if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND"); const table = (await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.id, tableId), eq(dataSourceTables.dataSourceId, dataSourceId), eq(dataSourceTables.isIncluded, true), eq(dataSourceTables.status, "ACTIVE"))).limit(1))[0]; if (!table) throw new HttpError(404, "Table is not available", "NOT_FOUND");
  const columns = await db.select().from(dataSourceColumns).where(and(eq(dataSourceColumns.tableId, tableId), eq(dataSourceColumns.isIncluded, true), eq(dataSourceColumns.status, "ACTIVE"))).orderBy(asc(dataSourceColumns.ordinalPosition)); const visible = columns.filter((column) => column.sensitivityType !== "CREDENTIAL"); if (!visible.length) return { columns: [], rows: [], rowLimit };
  const names = visible.map((column) => quote(column.columnName)); const select = `SELECT ${names.join(",")} FROM ${quote(table.schemaName)}.${quote(table.tableName)}`;
  const rows = await withOracleConnection(source, async (connection, outFormat) => { try { return (await connection.execute(`${select} FETCH FIRST :rowLimit ROWS ONLY`, { rowLimit }, { outFormat })).rows ?? []; } catch (error) { if (!String((error as Error).message).includes("ORA-00933")) throw error; return (await connection.execute(`SELECT * FROM (${select}) WHERE ROWNUM <= :rowLimit`, { rowLimit }, { outFormat })).rows ?? []; } });
  return { columns: visible.map((c) => ({ name: c.columnName, dataType: c.dataType, sensitivityType: c.sensitivityType })), rows: rows.map((row) => Object.fromEntries(visible.map((column) => [column.columnName, maskValue(row[column.columnName], column.sensitivityType as Sensitivity)]))), rowLimit };
}
