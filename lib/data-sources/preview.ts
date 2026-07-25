import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dataSourceColumns, dataSourceTables } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import { getDataSource } from "./service";
import { maskValue, type Sensitivity } from "./masking";
import { withOracleConnection } from "./oracle";
const identifier = /^[A-Za-z][A-Za-z0-9_$#]*$/;
const quote = (value: string) => { if (!identifier.test(value)) throw new HttpError(400, "Invalid Oracle identifier", "INVALID_IDENTIFIER"); return `"${value}"`; };
export async function previewTable(dataSourceId: string, tableId: string, rowLimit: number) {
  const source = await getDataSource(dataSourceId); if (!source) throw new HttpError(404, "Data source not found", "NOT_FOUND"); const table = (await db.select().from(dataSourceTables).where(and(eq(dataSourceTables.id, tableId), eq(dataSourceTables.dataSourceId, dataSourceId), eq(dataSourceTables.isIncluded, true), eq(dataSourceTables.status, "ACTIVE"))).limit(1))[0]; if (!table) throw new HttpError(404, "Table is not available", "NOT_FOUND");
  const columns = await db.select().from(dataSourceColumns).where(and(eq(dataSourceColumns.tableId, tableId), eq(dataSourceColumns.isIncluded, true), eq(dataSourceColumns.status, "ACTIVE"))).orderBy(asc(dataSourceColumns.ordinalPosition)); const visible = columns.filter((column) => column.sensitivityType !== "CREDENTIAL"); if (!visible.length) return { columns: [], rows: [], rowLimit };
  const names = visible.map((column) => quote(column.columnName)); const select = `SELECT ${names.join(",")} FROM ${quote(table.schemaName)}.${quote(table.tableName)}`;
  const rows = await withOracleConnection(source, async (connection, outFormat) => { try { return (await connection.execute(`${select} FETCH FIRST :rowLimit ROWS ONLY`, { rowLimit }, { outFormat })).rows ?? []; } catch (error) { if (!String((error as Error).message).includes("ORA-00933")) throw error; return (await connection.execute(`SELECT * FROM (${select}) WHERE ROWNUM <= :rowLimit`, { rowLimit }, { outFormat })).rows ?? []; } });
  return { columns: visible.map((c) => ({ name: c.columnName, dataType: c.dataType, sensitivityType: c.sensitivityType })), rows: rows.map((row) => Object.fromEntries(visible.map((column) => [column.columnName, maskValue(row[column.columnName], column.sensitivityType as Sensitivity)]))), rowLimit };
}
