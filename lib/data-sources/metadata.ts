import { withOracleConnection, type OracleSettings } from "./oracle";

export const defaultSystemSchemas = ["SYS", "SYSTEM", "XDB", "MDSYS", "CTXSYS", "ORDSYS", "DBSNMP", "OUTLN", "AUDSYS", "GSMADMIN_INTERNAL"];
function excludedSchemas() { return [...new Set([...defaultSystemSchemas, ...(process.env.ORACLE_EXCLUDED_SCHEMAS ?? "").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean)])]; }
function bindsFor(values: string[], prefix: string) { const binds: Record<string, string> = {}; const sql = values.map((value, index) => { const key = `${prefix}${index}`; binds[key] = value; return `:${key}`; }).join(","); return { sql, binds }; }
export type DiscoveredSchema = { schemaName: string; tableCount: number; viewCount: number };
export type DiscoveredTable = { schemaName: string; tableName: string; objectType: "TABLE" | "VIEW"; description: string | null; estimatedRowCount: number | null; lastAnalyzedAt: Date | null; isPartitioned: boolean; isTemporary: boolean };
export type DiscoveredColumn = { schemaName: string; tableName: string; columnName: string; dataType: string; dataLength: number | null; numericPrecision: number | null; numericScale: number | null; nullable: boolean; defaultValue: string | null; ordinalPosition: number; description: string | null };
export type DiscoveredConstraint = { owner: string; tableName: string; constraintName: string; constraintType: "P" | "R" | "U"; columnName: string; referencedOwner: string | null; referencedTable: string | null; referencedColumn: string | null };
export type DiscoveredIndex = { owner: string; tableName: string; indexName: string; columnName: string; columnPosition: number; isUnique: boolean };
const text = (v: unknown) => v == null ? null : String(v); const number = (v: unknown) => v == null ? null : Number(v);

export async function discoverSchemas(settings: OracleSettings): Promise<DiscoveredSchema[]> {
  const excluded = bindsFor(excludedSchemas(), "excluded");
  return withOracleConnection(settings, async (connection, outFormat) => {
    const result = await connection.execute(`SELECT OWNER AS SCHEMA_NAME, SUM(CASE WHEN OBJECT_TYPE='TABLE' THEN 1 ELSE 0 END) AS TABLE_COUNT, SUM(CASE WHEN OBJECT_TYPE='VIEW' THEN 1 ELSE 0 END) AS VIEW_COUNT FROM ALL_OBJECTS WHERE OBJECT_TYPE IN ('TABLE','VIEW') AND OWNER NOT IN (${excluded.sql}) GROUP BY OWNER ORDER BY OWNER`, excluded.binds, { outFormat });
    return (result.rows ?? []).map((r) => ({ schemaName: String(r.SCHEMA_NAME), tableCount: Number(r.TABLE_COUNT ?? 0), viewCount: Number(r.VIEW_COUNT ?? 0) }));
  });
}
export async function discoverMetadata(settings: OracleSettings, schemas: string[]) {
  if (!schemas.length) return { schemas: [], tables: [], columns: [], constraints: [], indexes: [] };
  const selected = bindsFor(schemas, "schema");
  return withOracleConnection(settings, async (connection, outFormat) => {
    const options = { outFormat };
    const schemaRows = await connection.execute(`SELECT OWNER AS SCHEMA_NAME, SUM(CASE WHEN OBJECT_TYPE='TABLE' THEN 1 ELSE 0 END) AS TABLE_COUNT, SUM(CASE WHEN OBJECT_TYPE='VIEW' THEN 1 ELSE 0 END) AS VIEW_COUNT FROM ALL_OBJECTS WHERE OWNER IN (${selected.sql}) AND OBJECT_TYPE IN ('TABLE','VIEW') GROUP BY OWNER`, selected.binds, options);
    const tableRows = await connection.execute(`SELECT O.OWNER AS SCHEMA_NAME, O.OBJECT_NAME AS TABLE_NAME, O.OBJECT_TYPE, C.COMMENTS AS DESCRIPTION, T.NUM_ROWS AS ESTIMATED_ROW_COUNT, T.LAST_ANALYZED, T.PARTITIONED, T.TEMPORARY FROM ALL_OBJECTS O LEFT JOIN ALL_TABLES T ON T.OWNER=O.OWNER AND T.TABLE_NAME=O.OBJECT_NAME LEFT JOIN ALL_TAB_COMMENTS C ON C.OWNER=O.OWNER AND C.TABLE_NAME=O.OBJECT_NAME WHERE O.OWNER IN (${selected.sql}) AND O.OBJECT_TYPE IN ('TABLE','VIEW')`, selected.binds, options);
    const columnRows = await connection.execute(`SELECT C.OWNER AS SCHEMA_NAME, C.TABLE_NAME, C.COLUMN_NAME, C.DATA_TYPE, C.DATA_LENGTH, C.DATA_PRECISION, C.DATA_SCALE, C.NULLABLE, C.DATA_DEFAULT, C.COLUMN_ID, M.COMMENTS AS DESCRIPTION FROM ALL_TAB_COLUMNS C LEFT JOIN ALL_COL_COMMENTS M ON M.OWNER=C.OWNER AND M.TABLE_NAME=C.TABLE_NAME AND M.COLUMN_NAME=C.COLUMN_NAME WHERE C.OWNER IN (${selected.sql}) ORDER BY C.OWNER,C.TABLE_NAME,C.COLUMN_ID`, selected.binds, options);
    const constraintRows = await connection.execute(`SELECT C.OWNER, C.TABLE_NAME, C.CONSTRAINT_NAME, C.CONSTRAINT_TYPE, CC.COLUMN_NAME, RC.OWNER AS REFERENCED_OWNER, RC.TABLE_NAME AS REFERENCED_TABLE, RCC.COLUMN_NAME AS REFERENCED_COLUMN FROM ALL_CONSTRAINTS C JOIN ALL_CONS_COLUMNS CC ON CC.OWNER=C.OWNER AND CC.CONSTRAINT_NAME=C.CONSTRAINT_NAME LEFT JOIN ALL_CONSTRAINTS RC ON RC.OWNER=C.R_OWNER AND RC.CONSTRAINT_NAME=C.R_CONSTRAINT_NAME LEFT JOIN ALL_CONS_COLUMNS RCC ON RCC.OWNER=RC.OWNER AND RCC.CONSTRAINT_NAME=RC.CONSTRAINT_NAME AND RCC.POSITION=CC.POSITION WHERE C.OWNER IN (${selected.sql}) AND C.CONSTRAINT_TYPE IN ('P','R','U')`, selected.binds, options);
    const indexRows = await connection.execute(`SELECT I.TABLE_OWNER AS OWNER, I.TABLE_NAME, I.INDEX_NAME, C.COLUMN_NAME, C.COLUMN_POSITION, I.UNIQUENESS FROM ALL_INDEXES I JOIN ALL_IND_COLUMNS C ON C.INDEX_OWNER=I.OWNER AND C.INDEX_NAME=I.INDEX_NAME WHERE I.TABLE_OWNER IN (${selected.sql})`, selected.binds, options);
    const schemasFound = (schemaRows.rows ?? []).map((r) => ({ schemaName: String(r.SCHEMA_NAME), tableCount: Number(r.TABLE_COUNT ?? 0), viewCount: Number(r.VIEW_COUNT ?? 0) }));
    const tables: DiscoveredTable[] = (tableRows.rows ?? []).map((r) => ({ schemaName: String(r.SCHEMA_NAME), tableName: String(r.TABLE_NAME), objectType: String(r.OBJECT_TYPE) as "TABLE" | "VIEW", description: text(r.DESCRIPTION), estimatedRowCount: number(r.ESTIMATED_ROW_COUNT), lastAnalyzedAt: r.LAST_ANALYZED ? new Date(String(r.LAST_ANALYZED)) : null, isPartitioned: r.PARTITIONED === "YES", isTemporary: r.TEMPORARY === "Y" }));
    const columns: DiscoveredColumn[] = (columnRows.rows ?? []).map((r) => ({ schemaName: String(r.SCHEMA_NAME), tableName: String(r.TABLE_NAME), columnName: String(r.COLUMN_NAME), dataType: String(r.DATA_TYPE), dataLength: number(r.DATA_LENGTH), numericPrecision: number(r.DATA_PRECISION), numericScale: number(r.DATA_SCALE), nullable: r.NULLABLE === "Y", defaultValue: text(r.DATA_DEFAULT)?.trim() ?? null, ordinalPosition: Number(r.COLUMN_ID), description: text(r.DESCRIPTION) }));
    const constraints: DiscoveredConstraint[] = (constraintRows.rows ?? []).map((r) => ({ owner: String(r.OWNER), tableName: String(r.TABLE_NAME), constraintName: String(r.CONSTRAINT_NAME), constraintType: String(r.CONSTRAINT_TYPE) as "P" | "R" | "U", columnName: String(r.COLUMN_NAME), referencedOwner: text(r.REFERENCED_OWNER), referencedTable: text(r.REFERENCED_TABLE), referencedColumn: text(r.REFERENCED_COLUMN) }));
    const indexes: DiscoveredIndex[] = (indexRows.rows ?? []).map((r) => ({ owner: String(r.OWNER), tableName: String(r.TABLE_NAME), indexName: String(r.INDEX_NAME), columnName: String(r.COLUMN_NAME), columnPosition: Number(r.COLUMN_POSITION), isUnique: r.UNIQUENESS === "UNIQUE" }));
    return { schemas: schemasFound, tables, columns, constraints, indexes };
  });
}
